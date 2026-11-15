"""Ingest historical FIRMS files and aggregate native hotspot counts of the configured extent.

The extent is `ASTRO_EXTENT`: `northeast` (the pilot, default) or `brazil` (the whole country). The historical
archives are already one CSV per country (Brazil), so the box only trims; the FIRMS area API answers by box,
so for `brazil` its rows are also limited to cells where the historical Brazil files have detections.
"""

from __future__ import annotations

import datetime as dt
import re
import shutil
import tempfile
from pathlib import Path
from zipfile import ZipFile

from astro_fire import storage
from astro_fire.config import Settings
from astro_fire.manifest import Manifest, new_run_id

ARCHIVES = {
    "modis": (2000, {"Terra": 2000, "Aqua": 2002}),
    "viirs-snpp": (2012, {"SNPP": 2012}),
    "viirs-jpss1": (2018, {"N20": 2018}),
}
SATELLITES = ("Aqua", "Terra", "SNPP", "N20")
LAST_ARCHIVE_YEAR = 2025
BBOX = (-48.8, -18.4, -34.7, -1.0)  # the Northeast pilot (docs/spec/harmonization.md)
EXTENTS = {
    "northeast": BBOX,
    # Mainland Brazil and its islands (Fernando de Noronha, Trindade): west, south, east, north.
    "brazil": (-74.0, -34.0, -28.0, 6.0),
}


def extent_bbox(settings: Settings) -> tuple[float, float, float, float]:
    try:
        return EXTENTS[settings.extent]
    except KeyError:
        names = ", ".join(EXTENTS)
        raise ValueError(f"ASTRO_EXTENT must be one of {names}, not {settings.extent!r}") from None

# Keep file row order for the stable source ID, even if DuckDB changes its scan parallelism.
DEDUPLICATE_SQL = """
CREATE OR REPLACE TEMP TABLE deduplicated AS
WITH raw AS (
    SELECT *
    FROM read_csv(?, header = true, all_varchar = true, parallel = false) WITH ORDINALITY
)
SELECT * EXCLUDE (ordinality), min(ordinality) AS source_row, count(*) - 1 AS exact_duplicates
FROM raw GROUP BY ALL
"""

INGEST_SQL = """
WITH parsed AS (
    SELECT
        sha256(? || ':' || source_row::VARCHAR) AS hotspot_id,
        try_cast(latitude AS DOUBLE) AS latitude,
        try_cast(longitude AS DOUBLE) AS longitude,
        CASE WHEN regexp_full_match(acq_time, '[0-9]{{1,4}}') THEN
            try_strptime(acq_date || lpad(acq_time, 4, '0'), '%Y-%m-%d%H%M')
        END AS acq_ts_utc,
        CASE satellite WHEN 'N' THEN 'SNPP' ELSE satellite END AS satellite,
        instrument, daynight, confidence AS confidence_raw,
        CASE WHEN instrument = 'MODIS' THEN
            CASE
                WHEN try_cast(confidence AS INTEGER) BETWEEN 0 AND 29 THEN 'l'
                WHEN try_cast(confidence AS INTEGER) BETWEEN 30 AND 79 THEN 'n'
                WHEN try_cast(confidence AS INTEGER) BETWEEN 80 AND 100 THEN 'h'
            END
        WHEN confidence IN ('l', 'n', 'h') THEN confidence END AS confidence_class,
        try_cast(frp AS DOUBLE) AS frp_mw,
        try_cast({mir} AS DOUBLE) AS brightness_mir_k,
        try_cast({tir} AS DOUBLE) AS brightness_tir_k,
        try_cast(scan AS DOUBLE) AS scan_km,
        try_cast(track AS DOUBLE) AS track_km,
        try_cast(type AS INTEGER) AS type,
        version
    FROM deduplicated
), clipped AS (
    SELECT *,
        (acq_ts_utc + to_microseconds(round(longitude * 240000000)::BIGINT))::DATE AS date_local,
        latitude + 90 AS y, longitude + 180 AS x
    FROM parsed
    WHERE longitude BETWEEN ? AND ? AND latitude BETWEEN ? AND ?
      AND acq_ts_utc IS NOT NULL AND daynight IN ('D', 'N') AND satellite IN (SELECT unnest(?))
      AND instrument = ?
), grids AS (
    SELECT *,
        'G' || lpad(floor(y)::INT::VARCHAR, 3, '0') || lpad(floor(x)::INT::VARCHAR, 3, '0') AS cell_l1,
        floor(y * 4)::INT % 4 * 4 + floor(x * 4)::INT % 4 + 1 AS l2,
        floor(y * 16)::INT % 4 * 4 + floor(x * 16)::INT % 4 + 1 AS l3
    FROM clipped
    WHERE year(date_local) BETWEEN ? AND ?
)
SELECT
    hotspot_id, latitude, longitude, acq_ts_utc, date_local,
    year(date_local) AS year, month(date_local) AS month,
    satellite, instrument, daynight, confidence_raw, confidence_class,
    frp_mw, brightness_mir_k, brightness_tir_k,
    brightness_mir_k - brightness_tir_k AS delta_t_k,
    scan_km, track_km, type, version,
    coalesce(({eligible_type}) AND confidence_class IN ('n', 'h'), false) AS passes_main_filter,
    cell_l1,
    cell_l1 || '.' || lpad(l2::VARCHAR, 2, '0') AS cell_l2,
    cell_l1 || '.' || lpad(l2::VARCHAR, 2, '0') || '.' || lpad(l3::VARCHAR, 2, '0') AS cell_l3,
    'Brazil' AS country, ? AS source_file
FROM grids
"""

AGGREGATE_SQL = """
SELECT
    cell_l2, year::INTEGER AS year, month, daynight, satellite,
    count(*) FILTER (WHERE passes_main_filter) AS n_hotspots,
    count(DISTINCT date_local) FILTER (WHERE passes_main_filter) AS n_active_days,
    sum(frp_mw) FILTER (WHERE passes_main_filter) AS frp_sum_mw,
    count(*) FILTER (WHERE {eligible_type}) AS n_all_confidence
FROM read_parquet(?, hive_partitioning = true)
GROUP BY ALL
HAVING n_hotspots > 0
"""


def parse_years(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"(\d{4})(?:-(\d{4}))?", value)
    if match is None:
        raise ValueError("use YYYY or YYYY-YYYY")
    first, last = int(match[1]), int(match[2] or match[1])
    if not 2000 <= first <= last <= LAST_ARCHIVE_YEAR:
        raise ValueError(f"years must be ordered and between 2000 and {LAST_ARCHIVE_YEAR}")
    return first, last


def _local_target(settings: Settings, dataset: str) -> Path:
    if settings.is_remote:
        raise ValueError("use --data-root data on the VM, then publish the verified local outputs")
    target = Path(storage.uri(settings, "processed", dataset, settings.dataset_version))
    if target.exists():
        raise FileExistsError(f"{target} already exists; use a fresh data root or dataset version")
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def _source(settings: Settings, sensor: str, year: int, staging: Path) -> tuple[Path, Path]:
    name = f"{sensor}_{year}_Brazil.csv"
    country_csv = Path(storage.uri(settings, "raw", "firms", "country", sensor, name))
    if country_csv.is_file():
        return country_csv, country_csv
    archive_name = f"{sensor}_{year}_all_countries.zip"
    archive = Path(storage.uri(settings, "raw", "firms", "global", sensor, archive_name))
    local_csv = staging / name
    with ZipFile(archive) as zf, zf.open(f"{sensor}/{year}/{name}") as source, local_csv.open("wb") as out:
        shutil.copyfileobj(source, out)
    return archive, local_csv


def _finish(manifest: Manifest, settings: Settings, target: Path, rows: int) -> dict:
    manifest.add_output(target.as_posix(), rows=rows)
    manifest.finish()
    return {
        "status": manifest.status,
        "output": target.as_posix(),
        "rows": rows,
        "manifest": manifest.write(storage.uri(settings, "manifests")),
        **manifest.checks,
    }


def ingest(settings: Settings, years: tuple[int, int], satellites: list[str]) -> dict:
    target = _local_target(settings, "hotspots")
    first, last = years
    manifest = Manifest(new_run_id("ingest"), "ingest", settings.redacted())
    duplicates_by_file: dict[str, int] = {}
    outside_bbox_by_file: dict[str, int] = {}
    bbox = extent_bbox(settings)
    manifest.checks = {
        "local_years": years, "satellites": satellites, "extent": settings.extent, "bbox": bbox,
        "exact_duplicate_rows_by_file": duplicates_by_file,
        "rows_outside_bbox_by_file": outside_bbox_by_file,
    }
    with tempfile.TemporaryDirectory(dir=target.parent) as temp, storage.connect(settings) as con:
        staging = Path(temp)
        shards = staging / "shards"
        shards.mkdir()
        for sensor, (start, availability) in ARCHIVES.items():
            selected = [satellite for satellite in satellites if satellite in availability]
            if not selected:
                continue
            start = max(start, min(availability[satellite] for satellite in selected))
            instrument = "MODIS" if sensor == "modis" else "VIIRS"
            mir, tir = ("brightness", "bright_t31") if sensor == "modis" else ("bright_ti4", "bright_ti5")
            west, south, east, north = bbox
            for year in range(max(first, start), min(last + 1, LAST_ARCHIVE_YEAR) + 1):
                source, csv = _source(settings, sensor, year, staging)
                print(f"Ingesting {csv.name}", flush=True)
                con.execute(DEDUPLICATE_SQL, [str(csv)])
                unique, duplicates, outside_bbox = con.execute("""
                    SELECT count(*), coalesce(sum(exact_duplicates), 0),
                           count(*) FILTER (WHERE NOT coalesce(
                               try_cast(longitude AS DOUBLE) BETWEEN ? AND ?
                               AND try_cast(latitude AS DOUBLE) BETWEEN ? AND ?, false
                           ))
                    FROM deduplicated
                """, [west, east, south, north]).fetchall()[0]
                manifest.add_input(source.as_posix(), rows=unique + duplicates)
                duplicates_by_file[csv.name] = duplicates
                outside_bbox_by_file[csv.name] = outside_bbox
                rows = con.sql(
                    INGEST_SQL.format(mir=mir, tir=tir, eligible_type="type = 0"),
                    params=[
                        csv.name, west, east, south, north,
                        selected, instrument, first, last, csv.name,
                    ],
                )
                rows.write_parquet(str(shards / f"{sensor}-{year}.parquet"), compression="zstd")
                if csv != source:
                    csv.unlink()
        output = staging / "output"
        inputs = str(shards / "*.parquet")
        count = con.execute("SELECT count(*) FROM read_parquet(?)", [inputs]).fetchone()[0]
        if count == 0:
            raise ValueError("no valid FIRMS detections in the selected region and years")
        con.execute(
            "COPY (SELECT * FROM read_parquet(?)) TO ? "
            "(FORMAT PARQUET, COMPRESSION ZSTD, PARTITION_BY (instrument, year))",
            [inputs, str(output)],
        )
        output.rename(target)
    input_rows = sum(item["rows"] for item in manifest.inputs)
    duplicate_rows = sum(duplicates_by_file.values())
    outside_bbox_rows = sum(outside_bbox_by_file.values())
    manifest.checks.update(
        raw_input_rows=input_rows,
        exact_duplicate_rows_dropped=duplicate_rows,
        rows_outside_bbox_dropped=outside_bbox_rows,
        other_rows_dropped=input_rows - duplicate_rows - outside_bbox_rows - count,
    )
    return _finish(manifest, settings, target, count)


def aggregate(settings: Settings) -> dict:
    target = _local_target(settings, "cell_month_counts")
    inputs = Path(storage.uri(settings, "processed", "hotspots", settings.dataset_version))
    manifest = Manifest(new_run_id("aggregate"), "aggregate", settings.redacted())
    for path in sorted(inputs.rglob("*.parquet")):
        manifest.add_input(path.as_posix())
    with tempfile.TemporaryDirectory(dir=target.parent) as temp, storage.connect(settings) as con:
        scan = str(inputs / "**" / "*.parquet")
        con.sql(AGGREGATE_SQL.format(eligible_type="type = 0"), params=[scan]).create("monthly_counts")
        rows = con.execute("SELECT count(*) FROM monthly_counts").fetchone()[0]
        if rows == 0:
            raise ValueError(f"no {settings.extent} hotspots passed the main filter")
        manifest.checks = {"coverage": con.execute("""
            SELECT satellite, min(year), max(year), count(DISTINCT year)
            FROM monthly_counts GROUP BY satellite ORDER BY satellite
        """).fetchall()}
        output = Path(temp) / "output"
        con.execute(
            "COPY monthly_counts TO ? (FORMAT PARQUET, COMPRESSION ZSTD, PARTITION_BY (year))",
            [str(output)],
        )
        output.rename(target)
    return _finish(manifest, settings, target, rows)


# --- Current-year detections from the FIRMS area API (raw/firms/api/<SOURCE>/<bbox>/*.csv) -------------

API_SOURCES = {  # FIRMS source prefix → (sensor label used in hotspot IDs, instrument)
    "VIIRS_SNPP": ("viirs-snpp", "VIIRS"),
    "VIIRS_NOAA20": ("viirs-jpss1", "VIIRS"),
}
API_2026_WINDOWS = {
    "VIIRS_SNPP_SP": (dt.date(2026, 1, 1), dt.date(2026, 7, 31)),
    "VIIRS_SNPP_NRT": (dt.date(2026, 8, 1), dt.date(2026, 11, 2)),
    "VIIRS_NOAA20_SP": (dt.date(2026, 1, 1), dt.date(2026, 7, 31)),
    "VIIRS_NOAA20_NRT": (dt.date(2026, 8, 1), dt.date(2026, 11, 14)),
}
API_ELIGIBLE_TYPE = "type = 0 OR (type IS NULL AND version LIKE '%NRT')"


def _api_files(settings: Settings, source: str) -> list[Path]:
    root = Path(storage.uri(settings, "raw", "firms", "api", source))
    return sorted(root.glob("*/*.csv")) if root.is_dir() else []


def _check_api_2026_coverage(
    files: dict[str, list[Path]], bbox: tuple[float, float, float, float] = BBOX
) -> None:
    bbox_dir = "_".join(map(str, bbox))
    for source, (first, last) in API_2026_WINDOWS.items():
        covered = set()
        for path in files[source]:
            if path.parent.name != bbox_dir:
                continue
            match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})_([1-5])d\.csv", path.name)
            if not match:
                raise ValueError(f"invalid FIRMS API chunk name: {path.name}")
            start = dt.date.fromisoformat(match[1])
            covered.update(start + dt.timedelta(days=day) for day in range(int(match[2])))
        expected = {first + dt.timedelta(days=day) for day in range((last - first).days + 1)}
        if missing := sorted(expected - covered):
            raise ValueError(
                f"{source} is missing CSV coverage for {len(missing)} UTC day(s), first {missing[0]}"
            )


def ingest_api(settings: Settings, year: int) -> dict:
    """Normalize one year of FIRMS area-API detections and write its hotspots and counts partitions.

    Standard-processing (`_SP`) files are used where they exist; near-real-time (`_NRT`) files only for
    later dates. The 2026 request windows must be complete. Untyped NRT detections retain null type and
    enter the provisional counts when confidence is nominal or high.

    Writes `processed/hotspots/<v>/instrument=VIIRS/year=<year>/` and
    `processed/cell_month_counts/<v>/year=<year>/`, replacing those partitions only.
    """
    if settings.is_remote:
        raise ValueError("use a local data root, then publish the partitions")
    bbox = extent_bbox(settings)
    bbox_dir = "_".join(map(str, bbox))
    # Only the chunks requested for this extent's box (the folder name is the box).
    files = {
        f"{prefix}_{kind}": [p for p in _api_files(settings, f"{prefix}_{kind}") if p.parent.name == bbox_dir]
        for prefix in API_SOURCES
        for kind in ("SP", "NRT")
    }
    if year == 2026:
        _check_api_2026_coverage(files, bbox)
    version = settings.dataset_version
    hotspots_root = Path(storage.uri(settings, "processed", "hotspots", version))
    hotspots_dir = hotspots_root / "instrument=VIIRS" / f"year={year}"
    counts_dir = Path(storage.uri(settings, "processed", "cell_month_counts", version)) / f"year={year}"
    manifest = Manifest(new_run_id("ingest-api"), "ingest-api", settings.redacted())
    west, south, east, north = bbox
    summary: dict[str, dict] = {}
    with tempfile.TemporaryDirectory(prefix="astro_api_") as temp, storage.connect(settings) as con:
        staging = Path(temp)
        shards = staging / "shards"
        shards.mkdir()
        for prefix, (sensor, instrument) in API_SOURCES.items():
            sp, nrt = files[f"{prefix}_SP"], files[f"{prefix}_NRT"]
            if not sp and not nrt:
                continue
            for path in sp + nrt:
                manifest.add_input(path.as_posix())
            parts = []
            if sp:
                relation = con.read_csv([str(p) for p in sp], header=True, all_varchar=True)
                relation.create_view("sp", replace=True)
                parts.append("SELECT * FROM sp")
            if nrt:
                relation = con.read_csv([str(p) for p in nrt], header=True, all_varchar=True)
                relation.create_view("nrt", replace=True)
                after = "WHERE acq_date > (SELECT max(acq_date) FROM sp)" if sp else ""
                type_column = "" if "type" in relation.columns else ", NULL::VARCHAR AS type"
                parts.append(f"SELECT *{type_column} FROM nrt {after}")
            combined = staging / f"{sensor}_{year}_api.csv"
            con.execute(
                f"COPY ({' UNION ALL BY NAME '.join(parts)}) TO '{combined}' (FORMAT csv, HEADER true)"
            )
            raw_rows, nrt_rows = con.execute(
                f"SELECT count(*), count(*) FILTER (WHERE version LIKE '%NRT') "
                f"FROM read_csv('{combined}', header = true, all_varchar = true)"
            ).fetchall()[0]
            name = f"{sensor}_{year}_api"
            satellites = [s for s, first in ARCHIVES[sensor][1].items() if first <= year]
            con.execute(DEDUPLICATE_SQL, [str(combined)])
            duplicates = con.execute(
                "SELECT coalesce(sum(exact_duplicates), 0) FROM deduplicated"
            ).fetchall()[0][0]
            rows = con.sql(
                INGEST_SQL.format(mir="bright_ti4", tir="bright_ti5", eligible_type=API_ELIGIBLE_TYPE),
                params=[name, west, east, south, north, satellites, instrument, year, year, name],
            )
            if settings.extent == "brazil":
                # The area API answers by box, which takes in parts of the neighbours: keep the cells where
                # the historical (per-country) Brazil files have detections. Border cells keep a few
                # foreign pixels.
                known = (hotspots_root / "**" / "*.parquet").as_posix().replace("'", "''")
                rows.create_view("api_rows", replace=True)
                rows = con.sql(
                    "SELECT * FROM api_rows WHERE cell_l2 IN (SELECT DISTINCT cell_l2 FROM "
                    f"read_parquet('{known}', hive_partitioning = true) WHERE year < {int(year)})"
                )
            rows.write_parquet(str(shards / f"{sensor}.parquet"), compression="zstd")
            summary[prefix] = {"files_sp": len(sp), "files_nrt": len(nrt), "raw_rows": raw_rows,
                               "raw_rows_nrt": nrt_rows, "exact_duplicates_dropped": int(duplicates)}
        if not summary:
            raise ValueError("no FIRMS area-API files under raw/firms/api")
        inputs = str(shards / "*.parquet")
        hot = staging / "hotspots"
        con.execute(
            "COPY (SELECT * FROM read_parquet(?)) TO ? "
            "(FORMAT PARQUET, COMPRESSION ZSTD, PARTITION_BY (instrument, year))",
            [inputs, str(hot)],
        )
        partition = hot / "instrument=VIIRS" / f"year={year}"
        if not partition.is_dir():
            raise ValueError(f"no detections for local year {year} in the API files")
        con.sql(
            AGGREGATE_SQL.format(eligible_type=API_ELIGIBLE_TYPE),
            params=[str(hot / "**" / "*.parquet")],
        ).create("monthly_counts")
        counts = staging / "counts"
        con.execute(
            "COPY monthly_counts TO ? (FORMAT PARQUET, COMPRESSION ZSTD, PARTITION_BY (year))",
            [str(counts)],
        )
        hotspot_rows, passing = con.execute(
            "SELECT count(*), count(*) FILTER (WHERE passes_main_filter) FROM read_parquet(?)", [inputs]
        ).fetchall()[0]
        coverage = con.execute(
            "SELECT satellite, min(month), max(month), sum(n_hotspots) FROM monthly_counts "
            "GROUP BY 1 ORDER BY 1"
        ).fetchall()
        for source, target in ((partition, hotspots_dir), (counts / f"year={year}", counts_dir)):
            shutil.rmtree(target, ignore_errors=True)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source, target)
    manifest.add_output(hotspots_dir.as_posix(), rows=hotspot_rows)
    manifest.add_output(counts_dir.as_posix(), rows=sum(int(c[3]) for c in coverage))
    manifest.checks = {
        "year": year, "sources": summary, "hotspot_rows": hotspot_rows, "passing_main_filter": passing,
        "months_by_satellite": [list(c) for c in coverage],
        "nrt_type_rule": "Missing type stays null; nominal/high confidence NRT counts are provisional",
    }
    manifest.finish()
    return {
        "status": manifest.status, "hotspots": hotspots_dir.as_posix(), "counts": counts_dir.as_posix(),
        "manifest": manifest.write(storage.uri(settings, "manifests")), **manifest.checks,
    }
