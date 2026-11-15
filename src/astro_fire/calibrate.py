"""`astro-fire calibrate`: monthly counts → transfer-function factors (docs/spec/harmonization.md, section 6).

Reads  processed/cell_month_counts/<version>/   (cell_l2, year, month, daynight, satellite, n_hotspots)
Writes processed/factors/<version>/part-0.parquet
       artifacts/<run_id>/metrics/calibration.json   (weights, cross-validation scores, regional ratios)
       manifests/<run_id>.json

The method lives in `astro_fire.calibration`; this module only checks the input, runs it and records the run.
"""

from __future__ import annotations

import json
import shutil
import tempfile
from collections.abc import Sequence
from pathlib import Path

import duckdb

from astro_fire import calibration as cal
from astro_fire import storage
from astro_fire.config import Settings
from astro_fire.manifest import Manifest, new_run_id

CALIBRATION_YEARS = tuple(range(2012, 2020))
TEST_YEARS = (2020, 2021)  # held out for `validate`; calibration must never see them
MODEL_VERSION = "fb-region-1"  # factor F + background B, pooled toward the whole extent
REQUIRED_COLUMNS = ("cell_l2", "year", "month", "daynight", "satellite", "n_hotspots")
FACTOR_COLUMNS = (  # processed/factors/v1 in docs/data-dictionary.md
    "cell_l2", "month", "period", "f", "b", "sum_aqua_pos", "sum_viirs_pos", "n_zero", "sum_viirs_zero",
    "r_region", "b_region", "k", "m", "weight_cell", "calibration_years", "model_version",
)


class CalibrationError(RuntimeError):
    """The input cannot be calibrated as it is; the message says what to fix."""


def parse_years(text: str) -> tuple[int, ...]:
    """'2012-2019' or '2012,2013,2015' → years."""
    years: set[int] = set()
    try:
        for part in text.split(","):
            if "-" in part:
                first, last = (int(v) for v in part.split("-", 1))
                years.update(range(first, last + 1))
            else:
                years.add(int(part))
    except ValueError as e:
        raise CalibrationError(f"cannot read years from {text!r}; use 2012-2019 or 2012,2013") from e
    if not years:
        raise CalibrationError("no years given")
    return tuple(sorted(years))


def load_counts(con: duckdb.DuckDBPyConnection, location: str, name: str = "counts") -> int:
    """Load the monthly counts into a temp table with the contract's types. Returns the row count."""
    glob = storage.parquet_glob(location)
    source = f"read_parquet('{glob}', hive_partitioning = true, union_by_name = true)"
    try:
        columns = {r[0] for r in con.execute(f"DESCRIBE SELECT * FROM {source}").fetchall()}
    except duckdb.Error as e:
        raise CalibrationError(
            f"no cell_month_counts Parquet found at {location}. Run `aggregate` first, or fetch it with "
            "`./scripts/sync_data.sh pull processed cell_month_counts`."
        ) from e
    missing = [c for c in REQUIRED_COLUMNS if c not in columns]
    if missing:
        raise CalibrationError(
            f"cell_month_counts at {location} lacks columns {missing}; found {sorted(columns)}"
        )
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        SELECT cell_l2::VARCHAR AS cell_l2, year::INT AS year, month::INT AS month,
               daynight::VARCHAR AS daynight, satellite::VARCHAR AS satellite,
               n_hotspots::BIGINT AS n_hotspots
        FROM {source}
        WHERE n_hotspots > 0
        """
    )
    duplicates = con.execute(
        f"SELECT count(*) FROM (SELECT 1 FROM {name} GROUP BY cell_l2, year, month, daynight, satellite "
        "HAVING count(*) > 1)"
    ).fetchone()[0]
    if duplicates:
        raise CalibrationError(
            f"cell_month_counts has {duplicates} keys with more than one row "
            "(cell_l2, year, month, daynight, satellite must be unique): was a file ingested twice?"
        )
    return con.execute(f"SELECT count(*) FROM {name}").fetchone()[0]


def find_gaps(
    con: duckdb.DuckDBPyConnection, counts: str, years: Sequence[int]
) -> list[tuple[int, int, str]]:
    """Check coverage. Returns (year, month, satellite) with no detection anywhere in the extent.

    A year with no rows at all for a satellite is an error. A single empty month is treated as a data gap,
    not as zero activity: the caller leaves that month out of the calibration.
    """
    present = con.execute(
        f"SELECT satellite, year, month FROM {counts} WHERE satellite IN (?, ?) GROUP BY ALL",
        [cal.SOURCE, cal.REFERENCE],
    ).fetchall()
    seen = {(s, y, mo) for s, y, mo in present}
    satellites = sorted({r[0] for r in con.execute(f"SELECT DISTINCT satellite FROM {counts}").fetchall()})
    for sat in (cal.SOURCE, cal.REFERENCE):
        missing_years = [y for y in years if not any((sat, y, mo) in seen for mo in range(1, 13))]
        if missing_years:
            raise CalibrationError(
                f"no {sat} rows for {missing_years} in cell_month_counts (satellites present: {satellites}). "
                "Calibration needs every requested year for both satellites."
            )
    return [(y, mo, sat) for y in years for mo in range(1, 13) for sat in (cal.SOURCE, cal.REFERENCE)
            if (sat, y, mo) not in seen and (y, mo) not in cal.PARTIAL_REFERENCE_MONTHS]


def _records(con: duckdb.DuckDBPyConnection, sql: str) -> list[dict]:
    cur = con.execute(sql)
    names = [d[0] for d in cur.description]
    return [dict(zip(names, row, strict=True)) for row in cur.fetchall()]


def run(
    settings: Settings,
    *,
    years: Sequence[int] = CALIBRATION_YEARS,
    k: float | None = None,
    m: float | None = None,
    counts_location: str | None = None,
    model_version: str = MODEL_VERSION,
) -> dict:
    """Fit the factors and write them, the calibration report and the manifest."""
    years = tuple(sorted(set(years)))
    overlap = sorted(set(years) & set(TEST_YEARS))
    if overlap:
        raise CalibrationError(f"{overlap} are test years, held out for validation; calibrate on other years")

    version = settings.dataset_version
    location = counts_location or storage.uri(settings, "processed", "cell_month_counts", version)
    run_id = new_run_id("calibrate")
    manifest = Manifest(run_id=run_id, pipeline="calibrate", settings=settings.redacted())
    con = storage.connect(settings)

    rows_in = load_counts(con, location)
    manifest.inputs.append({"path": location, "sha256": None, "rows": rows_in})
    gaps = find_gaps(con, "counts", years)
    excluded = sorted(set(cal.PARTIAL_REFERENCE_MONTHS) | {(y, mo) for y, mo, _ in gaps})
    excluded = [ym for ym in excluded if ym[0] in years]

    cal.build_panel(con, "counts", years, exclude_months=excluded)
    scores = cal.leave_one_year_out(con, "panel")
    if k is None or m is None:
        best_k, best_m = cal.choose_weights(scores)
        k, m = (best_k if k is None else k), (best_m if m is None else m)
        chosen_by = "leave-one-year-out MAE at cell-month level"
    else:
        chosen_by = "fixed on the command line"
    cal.fit_factors(con, "panel", k=k, m=m, model_version=model_version)

    panel = _records(con, """
        SELECT count(*) AS rows, count(DISTINCT cell_l2) AS cells, sum(a) AS sum_aqua, sum(v) AS sum_viirs,
               sum(v) / nullif(sum(a), 0) AS overall_ratio,
               avg((a = 0)::INT) AS share_zero_aqua_months,
               avg((a = 0 AND v > 0)::INT) AS share_viirs_only_months
        FROM panel""")[0]
    factors = _records(con, """
        SELECT count(*) AS rows, count(*) FILTER (WHERE f IS NULL) AS null_f,
               count(*) FILTER (WHERE b IS NULL) AS null_b,
               quantile_cont(f, 0.05) AS f_p05, median(f) AS f_median, quantile_cont(f, 0.95) AS f_p95,
               median(b) AS b_median, quantile_cont(b, 0.95) AS b_p95,
               avg(weight_cell) AS mean_weight_cell
        FROM factors""")[0]
    region = _records(con, """
        SELECT month, period, any_value(r_region) AS r_region, any_value(b_region) AS b_region,
               sum(sum_aqua_pos) AS sum_aqua_pos, sum(sum_viirs_pos) AS sum_viirs_pos,
               sum(n_zero) AS n_zero, sum(sum_viirs_zero) AS sum_viirs_zero
        FROM factors GROUP BY ALL ORDER BY period, month""")
    report = {
        "run_id": run_id,
        "model_version": model_version,
        "source_satellite": cal.SOURCE,
        "reference_satellite": cal.REFERENCE,
        "calibration_years": list(years),
        "test_years_untouched": list(TEST_YEARS),
        "excluded_months": [list(ym) for ym in excluded],
        "data_gaps": [{"year": y, "month": mo, "satellite": sat} for y, mo, sat in gaps],
        "weights": {"k": k, "m": m, "chosen_by": chosen_by, "candidates": list(cal.WEIGHT_GRID)},
        "leave_one_year_out": scores,
        "panel": panel,
        "factors": factors,
        "region_by_month_period": region,
    }

    factors_target = storage.uri(settings, "processed", "factors", version)
    artifacts_target = storage.uri(settings, "artifacts", run_id)
    staging = Path(tempfile.mkdtemp(prefix="astro_calibrate_"))
    try:
        (staging / "factors").mkdir()
        con.execute(
            f"COPY (SELECT {', '.join(FACTOR_COLUMNS)} FROM factors ORDER BY cell_l2, period, month) "
            f"TO '{staging / 'factors' / 'part-0.parquet'}' (FORMAT parquet, COMPRESSION zstd)"
        )
        (staging / "artifacts" / "metrics").mkdir(parents=True)
        (staging / "artifacts" / "metrics" / "calibration.json").write_text(
            json.dumps(report, indent=2, default=float) + "\n"
        )
        storage.publish_dir(settings, str(staging / "factors"), factors_target, replace=True)
        storage.publish_dir(settings, str(staging / "artifacts"), artifacts_target)
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    manifest.add_output(factors_target, rows=factors["rows"])
    manifest.add_output(f"{artifacts_target}/metrics/calibration.json", fmt="json")
    manifest.checks = {
        "calibration_years": list(years),
        "excluded_months": [list(ym) for ym in excluded],
        "data_gaps": len(gaps),
        "k": k, "m": m, "weights_chosen_by": chosen_by,
        "model_version": model_version,
        "panel_rows": panel["rows"], "cells": panel["cells"],
        "overall_ratio": panel["overall_ratio"],
        "factor_rows": factors["rows"], "null_f": factors["null_f"], "null_b": factors["null_b"],
    }
    manifest.finish("ok" if factors["rows"] > 0 else "failed")
    return {
        "status": manifest.status,
        "factors": factors_target,
        "report": f"{artifacts_target}/metrics/calibration.json",
        "manifest": manifest.save(settings),
        **manifest.checks,
    }
