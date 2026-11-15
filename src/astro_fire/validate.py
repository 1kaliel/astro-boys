"""`astro-fire validate`: score the transfer function on the held-out years (task H10).

Reads  processed/cell_month_counts/<version>/
Writes artifacts/<run_id>/metrics/validation.json   every method × level × split
       artifacts/<run_id>/reports/validation.md     the summary table
       manifests/<run_id>.json

It refits the factors from the calibration years with the same code as `calibrate`, so the scores always
describe what that command produces from the same input.
"""

from __future__ import annotations

import json
import shutil
import tempfile
from collections.abc import Sequence
from pathlib import Path

from astro_fire import calibration as cal
from astro_fire import storage, uncertainty
from astro_fire import validation as val
from astro_fire.calibrate import (
    CALIBRATION_YEARS,
    DEV_YEARS,
    FINAL_TEST_YEARS,
    LATE_YEARS,
    CalibrationError,
    choose_model,
    load_counts,
    model_version,
    months_to_exclude,
    witness_gap_months,
)
from astro_fire.config import Settings
from astro_fire.manifest import Manifest, new_run_id


def _score_years(con, settings: Settings, test_years: Sequence[int], season: Sequence[int], tag: str) -> dict:
    """Score every method on `test_years`: all months, and coverage-adequate months only."""
    incomplete, gaps, coverage_used = months_to_exclude(con, settings, test_years)
    cal.build_panel(con, "counts", test_years, name=f"test_panel_{tag}", exclude_months=(),
                    witness_gap_months=witness_gap_months(con, settings, test_years))
    val.build_eval(con, f"test_panel_{tag}", "factors", name=f"eval_{tag}")
    val.predict(con, "panel", "factors", f"eval_{tag}", name=f"predictions_all_{tag}")
    skip = ", ".join(f"({y}, {mo})" for y, mo in incomplete) or "(NULL, NULL)"
    con.execute(
        f"CREATE OR REPLACE TEMP TABLE predictions_{tag} AS "
        f"SELECT * FROM predictions_all_{tag} WHERE (year, month) NOT IN ({skip})"
    )
    scores = val.score(con, f"predictions_{tag}", season_months=season)
    regional = val.regional_difference(con, f"predictions_{tag}", val.best_regional_baseline(scores))
    rows, cells, outside = con.execute(
        f"SELECT count(*), count(DISTINCT cell_l2), count(DISTINCT cell_l2) FILTER "
        f"(WHERE cell_l2 NOT IN (SELECT cell_l2 FROM factors)) FROM predictions_{tag}"
    ).fetchone()
    con.execute(
        f"CREATE OR REPLACE TEMP TABLE _final_{tag} AS SELECT cell_l2, year, month, period, a AS raw_aqua, "
        f"f_pooled_background AS estimate, v FROM predictions_{tag}"
    )
    uncertainty.add_intervals(con, f"_final_{tag}", "uncertainty", name=f"_final_ci_{tag}")
    return {
        "interval_coverage_90pct": uncertainty.coverage(con, f"_final_ci_{tag}", f"_final_{tag}"),
        "test_years": list(test_years),
        "incomplete_months_left_out": [list(ym) for ym in incomplete],
        "data_gaps": [{"year": y, "month": mo, "satellite": sat} for y, mo, sat in gaps],
        "coverage_table_used": coverage_used,
        "eval": {"rows": rows, "cells": cells, "cells_outside_calibration_universe": outside},
        "verdict": val.verdict(scores, regional),
        "scores": scores,
        "scores_all_months": val.score(con, f"predictions_all_{tag}", season_months=season),
    }


def _table(result: dict, years: Sequence[int], label: str, k: float, m: float, pool: str,
           m_witness: float | None = None, lam: float = 0.0) -> str:
    extra = "" if m_witness is None else f", Terra-aware background with M = {m_witness:g}"
    extra += f", reconciled to the regional ratio with λ = {lam:g}" if lam else ""
    span = f"{result['test_years'][0]}–{result['test_years'][-1]}"
    left_out = ", ".join(f"{y}-{mo:02d}" for y, mo in result["incomplete_months_left_out"]) or "none"
    title = (
        f"Aqua → S-NPP monthly hotspot counts, {label} {span} "
        f"(calibrated on {years[0]}–{years[-1]}; pooling: {pool}, K = {k:g}, M = {m:g}{extra})"
    )
    notes = (
        "\nSource: NASA FIRMS active fire detections (MODIS Aqua, VIIRS S-NPP 375 m), filtered and gridded "
        "at 0.25°. Unit: detections per cell and month (MAE, RMSE); regional columns sum all cells and "
        "day + night per month. Bias = (predicted − observed) / observed over the period. "
        f"Rows: {result['eval']['rows']:,} ({result['eval']['cells']:,} cells). "
        f"Months left out because a satellite was not fully observing: {left_out}.\n"
    )
    return val.markdown_table(result["scores"], title=title) + notes


def run(
    settings: Settings,
    *,
    years: Sequence[int] = CALIBRATION_YEARS,
    test_years: Sequence[int] | None = None,
    final: bool = False,
    k: float | None = None,
    m: float | None = None,
    pool: str | None = None,
    witness: bool | None = None,
    reconcile: float | None = None,
    counts_location: str | None = None,
) -> dict:
    """Score the methods on held-out years.

    Default: the development years. `final=True` opens the final test years (and reports the late years
    separately); do it once, after the method is frozen.
    """
    years = tuple(sorted(set(years)))
    if final and test_years is not None:
        raise CalibrationError("--final uses the fixed final test years; do not pass test years with it")
    test_years = tuple(sorted(set(test_years or (FINAL_TEST_YEARS if final else DEV_YEARS))))
    overlap = sorted(set(years) & set(test_years))
    if overlap:
        raise CalibrationError(f"{overlap} are in both the calibration and the test years; they must not mix")
    locked = sorted(set(test_years) & set(FINAL_TEST_YEARS + LATE_YEARS))
    if locked and not final:
        raise CalibrationError(
            f"{locked} belong to the final test. It is scored once, with --final, after the method is frozen."
        )

    location = counts_location or storage.uri(
        settings, "processed", "cell_month_counts", settings.dataset_version
    )
    run_id = new_run_id("validate-final" if final else "validate")
    manifest = Manifest(run_id=run_id, pipeline="validate", settings=settings.redacted())
    con = storage.connect(settings)
    rows_in = load_counts(con, location)
    manifest.inputs.append({"path": location, "sha256": None, "rows": rows_in})

    # Calibration years only: panel, pooling level and weights, factors.
    excluded, _, _ = months_to_exclude(con, settings, years)
    cal.build_panel(con, "counts", years, exclude_months=excluded,
                    witness_gap_months=witness_gap_months(con, settings, years))
    choice = choose_model(con, "panel", k=k, m=m, pool=pool, witness=witness, reconcile=reconcile)
    k, m, pool = choice["k"], choice["m"], choice["pool"]
    witness, m_witness, lam = choice["witness"], choice["m_witness"], choice["reconcile_lambda"]
    version_name = model_version(pool, witness, lam)
    cal.fit_factors(con, "panel", k=k, m=m, pool=pool, model_version=version_name,
                    witness=witness, m_witness=m_witness, reconcile_lambda=lam)
    season = val.high_season_months(con, "panel")
    uncertainty.out_of_year_estimates(con, "panel", k=k, m=m, pool=pool, witness=witness,
                                      m_witness=m_witness, reconcile_lambda=lam)
    uncertainty.error_table(con, "out_of_year")

    # Held-out years: touched only from here on, and only to score.
    label = "final test" if final else "development years"
    main = _score_years(con, settings, test_years, season, "main")
    table = _table(main, years, label, k, m, pool, m_witness, lam)
    report = {
        "run_id": run_id,
        "stage": "final test" if final else "development",
        "model_version": version_name,
        "calibration_years": list(years),
        "excluded_calibration_months": [list(ym) for ym in excluded],
        "weights": {"k": k, "m": m, "pool": pool, "chosen_by": choice["chosen_by"],
                    "background": "witness" if witness else "static", "m_witness": m_witness,
                    "reconcile_lambda": lam},
        "high_season_months": season,
        "methods": [{"key": key, "label": lab, "role": role} for key, lab, role in val.METHODS],
        **main,
    }
    if final:
        late = _score_years(con, settings, LATE_YEARS, season, "late")
        report["late_years"] = late
        table += "\n" + _table(late, years, "late years (reported separately)", k, m, pool, m_witness, lam)
    decision = main["verdict"]

    target = storage.uri(settings, "artifacts", run_id)
    staging = Path(tempfile.mkdtemp(prefix="astro_validate_"))
    try:
        (staging / "metrics").mkdir()
        (staging / "reports").mkdir()
        (staging / "metrics" / "validation.json").write_text(
            json.dumps(report, indent=2, default=float) + "\n"
        )
        (staging / "reports" / "validation.md").write_text(table)
        storage.publish_dir(settings, str(staging), target)
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    manifest.add_output(f"{target}/metrics/validation.json", fmt="json")
    manifest.add_output(f"{target}/reports/validation.md", fmt="markdown")
    manifest.checks = {
        "stage": report["stage"],
        "calibration_years": list(years), "test_years": list(test_years), "k": k, "m": m, "pool": pool,
        "model_version": version_name,
        "eval_rows": main["eval"]["rows"],
        "incomplete_months_left_out": main["incomplete_months_left_out"],
        "accepted": decision["accepted"], "ship": decision["ship"],
    }
    manifest.finish("ok" if main["eval"]["rows"] > 0 else "failed")
    return {
        "status": manifest.status,
        "stage": report["stage"],
        "report": f"{target}/metrics/validation.json",
        "table": f"{target}/reports/validation.md",
        "manifest": manifest.save(settings),
        "k": k, "m": m, "pool": pool, "witness": witness, "m_witness": m_witness, "reconcile_lambda": lam,
        "incomplete_months_left_out": main["incomplete_months_left_out"],
        "verdict": decision,
        "summary": table,
    }
