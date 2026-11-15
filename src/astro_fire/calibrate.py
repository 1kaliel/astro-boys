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
from astro_fire import coverage, storage, uncertainty
from astro_fire.config import Settings
from astro_fire.manifest import Manifest, new_run_id

CALIBRATION_YEARS = tuple(range(2012, 2020))
# Held-out years. Calibration must never see any of them.
DEV_YEARS = (2020, 2021)         # development set: scored while the method was being built
FINAL_TEST_YEARS = (2022, 2023)  # final test: scored once (`validate --final`), after the method is frozen
LATE_YEARS = (2024, 2025)        # reported with the final test, separately: MODIS orbits drift in these years
HELD_OUT_YEARS = DEV_YEARS + FINAL_TEST_YEARS + LATE_YEARS
# The S-NPP / NOAA-20 ratio is measured up to this year: in 2026 S-NPP was failing before it ended.
CONTINUITY_LAST_YEAR = 2025
MODEL_FAMILY = "fb"  # factor F + background B; the model version adds the pooling level, e.g. fb-l1-2
MODEL_REVISION = 4
REQUIRED_COLUMNS = ("cell_l2", "year", "month", "daynight", "satellite", "n_hotspots")
FACTOR_COLUMNS = (  # processed/factors/v1 in docs/data-dictionary.md
    "cell_l2", "month", "period", "f", "b", "sum_aqua_pos", "sum_viirs_pos", "n_zero", "sum_viirs_zero",
    "r_region", "b_region", "k", "m", "weight_cell", "calibration_years", "model_version",
    "r_parent", "b_parent", "pool_level", *cal.WITNESS_COLUMNS, *cal.RECONCILE_COLUMNS,
)


def model_version(pool: str, witness: bool = False, reconcile_lambda: float = 0.0) -> str:
    parts = [MODEL_FAMILY, pool] + (["terra"] if witness else []) + (["rec"] if reconcile_lambda else [])
    return "-".join(parts + [str(MODEL_REVISION)])


def witness_gap_months(con, settings: Settings, years: Sequence[int]) -> list[tuple[int, int]]:
    """Months in which the witness satellite was not fully observing (from the coverage table, if any)."""
    location = storage.uri(settings, "processed", "coverage_monthly", settings.dataset_version)
    incomplete = coverage.incomplete_months(con, location, (cal.WITNESS,), tuple(years)) or []
    return sorted({(y, mo) for y, mo, _ in incomplete})


def choose_model(
    con, panel: str, *, k: float | None, m: float | None, pool: str | None, witness: bool | None = None,
    reconcile: float | None = None,
) -> dict:
    """Pooling level, weights, background type and reconciliation strength: fixed where given, otherwise
    by leave-one-year-out Poisson deviance on the calibration years."""
    pools = (pool,) if pool else cal.POOL_LEVELS
    choice = cal.choose_pooling(con, panel, pools=pools, witness=witness)
    given = (("k", k), ("m", m), ("pool", pool), ("witness", witness), ("reconcile", reconcile))
    fixed = [name for name, value in given if value is not None]
    choice["k"] = choice["k"] if k is None else float(k)
    choice["m"] = choice["m"] if m is None else float(m)
    choice["reconcile_scores"] = cal.reconcile_scores(
        con, panel, k=choice["k"], m=choice["m"], pool=choice["pool"], witness=choice["witness"],
        m_witness=choice["m_witness"],
    )
    choice["reconcile_lambda"] = (
        cal.choose_lambda(choice["reconcile_scores"]) if reconcile is None else float(reconcile)
    )
    choice["chosen_by"] = "leave-one-year-out Poisson deviance, calibration years only"
    if fixed:
        choice["chosen_by"] += f"; fixed on the command line: {', '.join(fixed)}"
    return choice


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


def months_to_exclude(
    con: duckdb.DuckDBPyConnection, settings: Settings, years: Sequence[int], counts: str = "counts"
) -> tuple[list[tuple[int, int]], list[tuple[int, int, str]], bool]:
    """Months that must not be paired because one of the two satellites was not fully observing.

    Uses the monthly coverage table (`astro-fire coverage`) when it exists; a month with no detections at
    all for one satellite is always excluded. Returns (months, the gaps behind them, coverage table used).
    """
    gaps = set(find_gaps(con, counts, years))
    location = storage.uri(settings, "processed", "coverage_monthly", settings.dataset_version)
    incomplete = coverage.incomplete_months(con, location, (cal.SOURCE, cal.REFERENCE), tuple(years))
    months = {(y, mo) for y, mo, _ in gaps}
    if incomplete is None:  # no coverage table: fall back to the one partial month known in advance
        months |= {ym for ym in cal.PARTIAL_REFERENCE_MONTHS if ym[0] in years}
    else:
        gaps |= set(incomplete)
        months |= {(y, mo) for y, mo, _ in incomplete}
    return sorted(months), sorted(gaps), incomplete is not None


def continuity(con: duckdb.DuckDBPyConnection, settings: Settings, counts: str = "counts") -> dict | None:
    """Ratio of S-NPP to NOAA-20 detections, for carrying the observed series past the end of S-NPP.

    Ratio of sums over the months in which both satellites were fully observing, overall, by day/night and
    by month of year. None when NOAA-20 or the coverage table is missing.
    """
    location = storage.uri(settings, "processed", "coverage_monthly", settings.dataset_version)
    try:
        con.execute(
            f"""
            CREATE OR REPLACE TEMP TABLE _both_complete AS
            SELECT year, month FROM read_parquet('{storage.parquet_glob(location)}')
            WHERE satellite IN ('SNPP', 'N20') AND year <= {CONTINUITY_LAST_YEAR}
            GROUP BY ALL HAVING bool_and(is_complete) AND count(*) = 2
            """
        )
    except duckdb.Error:
        return None
    ratio = ("sum(n_hotspots) FILTER (WHERE satellite = 'SNPP')::DOUBLE "
             "/ nullif(sum(n_hotspots) FILTER (WHERE satellite = 'N20'), 0)")
    source = f"{counts} JOIN _both_complete USING (year, month) WHERE satellite IN ('SNPP', 'N20')"
    months, overall = con.execute(f"SELECT count(DISTINCT (year, month)), {ratio} FROM {source}").fetchone()
    if not months or overall is None:
        return None
    return {
        "months": months,
        "overall": overall,
        "by_period": _records(
            con, f"SELECT daynight AS period, {ratio} AS ratio FROM {source} GROUP BY 1 ORDER BY 1"
        ),
        "by_year": _records(con, f"SELECT year, {ratio} AS ratio FROM {source} GROUP BY 1 ORDER BY 1"),
        "by_month_period": _records(
            con,
            f"SELECT month, daynight AS period, {ratio} AS ratio FROM {source} GROUP BY ALL ORDER BY 2, 1",
        ),
    }


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
    pool: str | None = None,
    witness: bool | None = None,
    reconcile: float | None = None,
    counts_location: str | None = None,
) -> dict:
    """Fit the factors and write them, the calibration report and the manifest."""
    years = tuple(sorted(set(years)))
    overlap = sorted(set(years) & set(HELD_OUT_YEARS))
    if overlap:
        raise CalibrationError(f"{overlap} are held out for validation; calibrate on other years")

    version = settings.dataset_version
    location = counts_location or storage.uri(settings, "processed", "cell_month_counts", version)
    run_id = new_run_id("calibrate")
    manifest = Manifest(run_id=run_id, pipeline="calibrate", settings=settings.redacted())
    con = storage.connect(settings)

    rows_in = load_counts(con, location)
    manifest.inputs.append({"path": location, "sha256": None, "rows": rows_in})
    excluded, gaps, coverage_checked = months_to_exclude(con, settings, years)

    cal.build_panel(con, "counts", years, exclude_months=excluded,
                    witness_gap_months=witness_gap_months(con, settings, years))
    choice = choose_model(con, "panel", k=k, m=m, pool=pool, witness=witness, reconcile=reconcile)
    k, m, pool, scores, chosen_by = (choice[key] for key in ("k", "m", "pool", "scores", "chosen_by"))
    witness, m_witness, lam = choice["witness"], choice["m_witness"], choice["reconcile_lambda"]
    version_name = model_version(pool, witness, lam)
    cal.fit_factors(con, "panel", k=k, m=m, pool=pool, model_version=version_name,
                    witness=witness, m_witness=m_witness, reconcile_lambda=lam)

    # Prediction error measured out of year, for the intervals of the estimates.
    uncertainty.out_of_year_estimates(con, "panel", k=k, m=m, pool=pool, witness=witness,
                                      m_witness=m_witness, reconcile_lambda=lam)
    uncertainty.error_table(con, "out_of_year")
    con.execute("CREATE OR REPLACE TEMP TABLE _oy_obs AS "
                "SELECT cell_l2, year, month, period, observed AS v FROM out_of_year")
    uncertainty.add_intervals(con, "out_of_year", "uncertainty")
    interval_check = uncertainty.coverage(con, "estimates_ci", "_oy_obs")
    inflation = uncertainty.sum_inflation(con, "out_of_year", "uncertainty")

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
        "model_version": version_name,
        "source_satellite": cal.SOURCE,
        "reference_satellite": cal.REFERENCE,
        "calibration_years": list(years),
        "held_out_years_untouched": list(HELD_OUT_YEARS),
        "excluded_months": [list(ym) for ym in excluded],
        "data_gaps": [{"year": y, "month": mo, "satellite": sat} for y, mo, sat in gaps],
        "coverage_table_used": coverage_checked,
        "weights": {"k": k, "m": m, "pool": pool, "chosen_by": chosen_by,
                    "background": "witness" if witness else "static", "m_witness": m_witness,
                    "reconcile_lambda": lam, "reconcile_scores": choice["reconcile_scores"],
                    "reconcile_min_gain": cal.RECONCILE_MIN_GAIN,
                    "witness_satellite": cal.WITNESS if witness else None,
                    "deviance_zero_static_same_months": choice.get("deviance_zero_static_same_months"),
                    "deviance_zero_witness": choice.get("deviance_zero_witness"),
                    "candidates": list(cal.WEIGHT_GRID), "pool_candidates": list(cal.POOL_LEVELS)},
        "leave_one_year_out": scores,
        "panel": panel,
        "factors": factors,
        "intervals": {
            "method": "empirical out-of-year error by size of the estimate, regime and period",
            "coverage_of_90pct_interval_out_of_year": interval_check,
            "sum_inflation": inflation,
            "note": "the variance of a sum of cells is larger than the sum of their variances by this factor",
        },
        "continuity_snpp_over_noaa20": continuity(con, settings),
        "region_by_month_period": region,
    }

    uncertainty_target = storage.uri(settings, "processed", "uncertainty", version)
    factors_target = storage.uri(settings, "processed", "factors", version)
    artifacts_target = storage.uri(settings, "artifacts", run_id)
    staging = Path(tempfile.mkdtemp(prefix="astro_calibrate_"))
    try:
        (staging / "factors").mkdir()
        con.execute(
            f"COPY (SELECT {', '.join(FACTOR_COLUMNS)} FROM factors ORDER BY cell_l2, period, month) "
            f"TO '{staging / 'factors' / 'part-0.parquet'}' (FORMAT parquet, COMPRESSION zstd)"
        )
        (staging / "uncertainty").mkdir()
        con.execute(
            f"COPY (SELECT * FROM uncertainty ORDER BY regime, period, bin) "
            f"TO '{staging / 'uncertainty' / 'part-0.parquet'}' (FORMAT parquet, COMPRESSION zstd)"
        )
        storage.publish_dir(settings, str(staging / "uncertainty"), uncertainty_target, replace=True)
        if report["continuity_snpp_over_noaa20"]:
            (staging / "continuity").mkdir()
            rows = report["continuity_snpp_over_noaa20"]["by_month_period"]
            values = ", ".join(f"({r['month']}, '{r['period']}', {r['ratio']})" for r in rows)
            con.execute(
                f"COPY (SELECT * FROM (VALUES {values}) t(month, period, ratio) ORDER BY period, month) "
                f"TO '{staging / 'continuity' / 'part-0.parquet'}' (FORMAT parquet, COMPRESSION zstd)"
            )
            storage.publish_dir(settings, str(staging / "continuity"),
                                storage.uri(settings, "processed", "continuity", version), replace=True)
        (staging / "artifacts" / "metrics").mkdir(parents=True)
        (staging / "artifacts" / "metrics" / "calibration.json").write_text(
            json.dumps(report, indent=2, default=float) + "\n"
        )
        storage.publish_dir(settings, str(staging / "factors"), factors_target, replace=True)
        storage.publish_dir(settings, str(staging / "artifacts"), artifacts_target)
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    manifest.add_output(factors_target, rows=factors["rows"])
    error_rows = con.execute("SELECT count(*) FROM uncertainty").fetchone()[0]
    manifest.add_output(uncertainty_target, rows=error_rows)
    manifest.add_output(f"{artifacts_target}/metrics/calibration.json", fmt="json")
    manifest.checks = {
        "calibration_years": list(years),
        "excluded_months": [list(ym) for ym in excluded],
        "data_gaps": len(gaps), "coverage_table_used": coverage_checked,
        "k": k, "m": m, "pool": pool, "witness": witness, "m_witness": m_witness,
        "reconcile_lambda": lam, "weights_chosen_by": chosen_by,
        "model_version": version_name,
        "panel_rows": panel["rows"], "cells": panel["cells"],
        "overall_ratio": panel["overall_ratio"],
        "factor_rows": factors["rows"], "null_f": factors["null_f"], "null_b": factors["null_b"],
    }
    manifest.finish("ok" if factors["rows"] > 0 else "failed")
    return {
        "status": manifest.status,
        "factors": factors_target,
        "uncertainty": uncertainty_target,
        "report": f"{artifacts_target}/metrics/calibration.json",
        "manifest": manifest.save(settings),
        **manifest.checks,
    }
