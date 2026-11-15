"""Ingest historical FIRMS files and aggregate native Northeast hotspot counts."""

from __future__ import annotations

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
BBOX = (-48.8, -18.4, -34.7, -1.0)

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
    coalesce(type = 0 AND confidence_class IN ('n', 'h'), false) AS passes_main_filter,
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
    count(*) FILTER (WHERE type = 0) AS n_all_confidence
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
    manifest.checks = {
        "local_years": years, "satellites": satellites, "bbox": BBOX,
        "exact_duplicate_rows_by_file": duplicates_by_file,
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
            west, south, east, north = BBOX
            for year in range(max(first, start), min(last + 1, LAST_ARCHIVE_YEAR) + 1):
                source, csv = _source(settings, sensor, year, staging)
                print(f"Ingesting {csv.name}", flush=True)
                con.execute(DEDUPLICATE_SQL, [str(csv)])
                unique, duplicates = con.execute(
                    "SELECT count(*), coalesce(sum(exact_duplicates), 0) FROM deduplicated"
                ).fetchall()[0]
                manifest.add_input(source.as_posix(), rows=unique + duplicates)
                duplicates_by_file[csv.name] = duplicates
                rows = con.sql(
                    INGEST_SQL.format(mir=mir, tir=tir),
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
    manifest.checks["exact_duplicate_rows_dropped"] = sum(duplicates_by_file.values())
    return _finish(manifest, settings, target, count)


def aggregate(settings: Settings) -> dict:
    target = _local_target(settings, "cell_month_counts")
    inputs = Path(storage.uri(settings, "processed", "hotspots", settings.dataset_version))
    manifest = Manifest(new_run_id("aggregate"), "aggregate", settings.redacted())
    for path in sorted(inputs.rglob("*.parquet")):
        manifest.add_input(path.as_posix())
    with tempfile.TemporaryDirectory(dir=target.parent) as temp, storage.connect(settings) as con:
        scan = str(inputs / "**" / "*.parquet")
        con.sql(AGGREGATE_SQL, params=[scan]).create("monthly_counts")
        rows = con.execute("SELECT count(*) FROM monthly_counts").fetchone()[0]
        if rows == 0:
            raise ValueError("no Northeast hotspots passed the main filter")
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
