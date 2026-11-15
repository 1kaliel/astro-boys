"""Observation coverage per satellite: which days and months have data, and which are gaps.

FIRMS files only list detections, so an outage looks exactly like a quiet period. Treating it as zero
activity breaks the rule that missing is never zero. This module finds gaps from region-wide evidence only:

    A day is `missing` for a satellite when it recorded at most 10% of the detections that the other
    satellites imply for that day, at least 30 were expected, and this lasted three or more days in a row.

The expectation comes from the other satellites operating that day, each scaled by its usual ratio to this
satellite for that month of the year. A quiet cell, or a quiet day for the whole region, is never a gap:
with fewer than 30 expected detections nothing is flagged. The rule is deliberately extreme (near-total
absence, sustained), so that it finds outages and not ordinary day-to-day variation between sensors:
single low days are common and normal, because MODIS swaths leave gaps at low latitudes that VIIRS does
not.

Limits: it cannot see a gap shared by every satellite, outages shorter than three days, partial outages,
or gaps in the rainy season when few detections are expected. Dates should be cross-checked with the
instrument notices.
"""

from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

import duckdb

from astro_fire import storage
from astro_fire.config import Settings
from astro_fire.manifest import Manifest, new_run_id

MISSING_FRACTION = 0.1   # at most this share of the expected detections
MIN_EXPECTED = 30        # and at least this many expected, or the day is not judged
MIN_RUN_DAYS = 3         # and that many low days in a row, or it is ordinary variation
COMPLETE_FRACTION = 0.9  # a month is complete when at least this share of its days was observed


class CoverageError(RuntimeError):
    """The coverage tables cannot be built or read; the message says what to fix."""


def daily_counts(con: duckdb.DuckDBPyConnection, hotspots_location: str, name: str = "daily") -> str:
    """Region-wide detections per satellite and local day, all confidence classes and types."""
    if hotspots_location.startswith("gs://"):
        try:
            con.register_filesystem(storage._gcs_filesystem())
        except duckdb.Error:
            pass  # already registered by storage.connect
    glob = storage.parquet_glob(hotspots_location)
    try:
        con.execute(
            f"""
            CREATE OR REPLACE TEMP TABLE {name} AS
            SELECT satellite::VARCHAR AS satellite, date_local::DATE AS date_local, count(*)::BIGINT AS n_all
            FROM read_parquet('{glob}', hive_partitioning = true, union_by_name = true)
            GROUP BY ALL
            """
        )
    except duckdb.Error as e:
        raise CoverageError(f"cannot read hotspots Parquet at {hotspots_location}: {e}") from e
    return name


def flag_days(
    con: duckdb.DuckDBPyConnection,
    daily: str,
    *,
    name: str = "coverage_daily",
    missing_fraction: float = MISSING_FRACTION,
    min_expected: float = MIN_EXPECTED,
    min_run_days: int = MIN_RUN_DAYS,
) -> str:
    """One row per satellite and day of the whole period, with `status`: ok, missing or not_operating.

    A satellite is `not_operating` before its first and after its last detection in the data.
    """
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH span AS (
            SELECT satellite, min(date_local) AS d0, max(date_local) AS d1 FROM {daily} GROUP BY 1
        ),
        bounds AS (SELECT min(d0) AS lo, max(d1) AS hi FROM span),
        cal AS (
            SELECT s.satellite, t.d::DATE AS date_local, t.d::DATE BETWEEN s.d0 AND s.d1 AS operating
            FROM span s, bounds b, generate_series(b.lo, b.hi, INTERVAL 1 DAY) t(d)
        ),
        obs AS (
            SELECT c.satellite, c.date_local, c.operating, coalesce(x.n_all, 0) AS n
            FROM cal c LEFT JOIN {daily} x USING (satellite, date_local)
        ),
        pairs AS (
            SELECT a.satellite, a.date_local, b.satellite AS other, a.n, b.n AS n_other
            FROM obs a JOIN obs b ON a.date_local = b.date_local AND a.satellite <> b.satellite
            WHERE a.operating AND b.operating
        ),
        ratio AS (  -- usual detections of `satellite` per detection of `other`, by month of the year
            SELECT satellite, other, month(date_local) AS m, sum(n)::DOUBLE / nullif(sum(n_other), 0) AS r
            FROM pairs GROUP BY ALL
        ),
        expect AS (
            SELECT p.satellite, p.date_local, max(p.n_other * r.r) AS expected
            FROM pairs p JOIN ratio r
              ON r.satellite = p.satellite AND r.other = p.other AND r.m = month(p.date_local)
            GROUP BY ALL
        ),
        judged AS (
            SELECT o.satellite, o.date_local, o.n AS n_all, e.expected, o.operating,
                   o.operating AND e.expected >= $min_expected AND o.n <= $fraction * e.expected AS low
            FROM obs o LEFT JOIN expect e USING (satellite, date_local)
        ),
        runs AS (  -- consecutive low days share the same `grp`
            SELECT *, date_local - (row_number() OVER (PARTITION BY satellite, low ORDER BY date_local))::INT
                          AS grp
            FROM judged
        )
        SELECT satellite, date_local, n_all, expected,
               CASE WHEN NOT operating THEN 'not_operating'
                    WHEN low AND count(*) OVER (PARTITION BY satellite, low, grp) >= $min_run THEN 'missing'
                    ELSE 'ok' END AS status
        FROM runs
        """,
        {"fraction": float(missing_fraction), "min_expected": float(min_expected),
         "min_run": int(min_run_days)},
    )
    return name


def monthly(
    con: duckdb.DuckDBPyConnection,
    coverage_daily: str,
    *,
    name: str = "coverage_monthly",
    complete_fraction: float = COMPLETE_FRACTION,
) -> str:
    """Per satellite and month: days observed, coverage fraction and whether the month is complete."""
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH m AS (
            SELECT satellite, year(date_local)::INT AS year, month(date_local)::INT AS month,
                   count(*)::INT AS days_in_month,
                   count(*) FILTER (WHERE status = 'not_operating')::INT AS days_not_operating,
                   count(*) FILTER (WHERE status = 'missing')::INT AS days_missing
            FROM {coverage_daily} GROUP BY ALL
        )
        SELECT *, days_in_month - days_not_operating - days_missing AS days_observed,
               (days_in_month - days_not_operating - days_missing)::DOUBLE / days_in_month
                   AS coverage_fraction,
               (days_in_month - days_not_operating - days_missing)::DOUBLE / days_in_month >= $complete
                   AS is_complete
        FROM m
        """,
        {"complete": float(complete_fraction)},
    )
    return name


def gap_runs(con: duckdb.DuckDBPyConnection, coverage_daily: str) -> list[dict]:
    """Runs of consecutive missing days, for the report."""
    cur = con.execute(
        f"""
        WITH z AS (
            SELECT *, date_local - (row_number() OVER (PARTITION BY satellite ORDER BY date_local))::INT
                          AS grp
            FROM {coverage_daily} WHERE status = 'missing'
        )
        SELECT satellite, min(date_local)::VARCHAR AS first_day, max(date_local)::VARCHAR AS last_day,
               count(*)::INT AS days, sum(n_all)::BIGINT AS detections,
               round(sum(expected))::BIGINT AS expected
        FROM z GROUP BY satellite, grp ORDER BY first_day, satellite
        """
    )
    names = [d[0] for d in cur.description]
    return [dict(zip(names, row, strict=True)) for row in cur.fetchall()]


def incomplete_months(
    con: duckdb.DuckDBPyConnection, location: str, satellites: tuple[str, ...], years: tuple[int, ...]
) -> list[tuple[int, int, str]] | None:
    """(year, month, satellite) that are not complete, from a published monthly coverage table.

    Returns None when the table does not exist, so the caller can say that coverage was not checked.
    """
    try:
        rows = con.execute(
            f"SELECT year, month, satellite FROM read_parquet('{storage.parquet_glob(location)}') "
            "WHERE NOT is_complete AND list_contains(?, satellite) AND list_contains(?, year) ORDER BY ALL",
            [list(satellites), list(years)],
        ).fetchall()
    except duckdb.Error:
        return None
    return [(int(y), int(mo), sat) for y, mo, sat in rows]


def run(settings: Settings, *, hotspots_location: str | None = None) -> dict:
    """Build `coverage_daily` and `coverage_monthly` from the hotspots table and write a gap report."""
    version = settings.dataset_version
    location = hotspots_location or storage.uri(settings, "processed", "hotspots", version)
    run_id = new_run_id("coverage")
    manifest = Manifest(run_id=run_id, pipeline="coverage", settings=settings.redacted())
    con = storage.connect(settings)
    daily_counts(con, location)
    rows_in = con.execute("SELECT sum(n_all) FROM daily").fetchone()[0]
    if not rows_in:
        raise CoverageError(f"no detections found at {location}")
    manifest.inputs.append({"path": location, "sha256": None, "rows": int(rows_in)})
    flag_days(con, "daily")
    monthly(con, "coverage_daily")
    gaps = gap_runs(con, "coverage_daily")
    cur = con.execute(
        "SELECT satellite, year, month, days_in_month, days_missing, days_observed FROM coverage_monthly "
        "WHERE NOT is_complete AND days_not_operating < days_in_month ORDER BY year, month, satellite"
    )
    names = [d[0] for d in cur.description]
    incomplete = [dict(zip(names, row, strict=True)) for row in cur.fetchall()]
    report = {
        "run_id": run_id,
        "rule": {
            "missing_day": f"at most {MISSING_FRACTION:.0%} of the detections implied by the other "
                           f"satellites, at least {MIN_EXPECTED} expected, for {MIN_RUN_DAYS} or more "
                           "days in a row",
            "complete_month": f"at least {COMPLETE_FRACTION:.0%} of its days observed",
        },
        "gaps": gaps,
        "incomplete_months": incomplete,
    }

    targets = {
        "coverage_daily": storage.uri(settings, "processed", "coverage_daily", version),
        "coverage_monthly": storage.uri(settings, "processed", "coverage_monthly", version),
    }
    artifacts_target = storage.uri(settings, "artifacts", run_id)
    staging = Path(tempfile.mkdtemp(prefix="astro_coverage_"))
    try:
        for table, target in targets.items():
            (staging / table).mkdir()
            con.execute(
                f"COPY (SELECT * FROM {table} ORDER BY satellite, 2, 3) "
                f"TO '{staging / table / 'part-0.parquet'}' (FORMAT parquet, COMPRESSION zstd)"
            )
            storage.publish_dir(settings, str(staging / table), target, replace=True)
            manifest.add_output(target, rows=con.execute(f"SELECT count(*) FROM {table}").fetchone()[0])
        (staging / "artifacts" / "reports").mkdir(parents=True)
        (staging / "artifacts" / "reports" / "coverage.json").write_text(
            json.dumps(report, indent=2) + "\n"
        )
        storage.publish_dir(settings, str(staging / "artifacts"), artifacts_target)
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    manifest.add_output(f"{artifacts_target}/reports/coverage.json", fmt="json")
    manifest.checks = {
        "detections": int(rows_in), "gap_runs": len(gaps),
        "missing_days": sum(g["days"] for g in gaps), "incomplete_months": len(incomplete),
    }
    manifest.finish("ok")
    return {
        "status": manifest.status, **targets,
        "report": f"{artifacts_target}/reports/coverage.json",
        "manifest": manifest.save(settings), **manifest.checks,
    }
