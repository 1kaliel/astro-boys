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
from astro_fire import storage
from astro_fire import validation as val
from astro_fire.calibrate import (
    CALIBRATION_YEARS,
    TEST_YEARS,
    CalibrationError,
    choose_model,
    find_gaps,
    load_counts,
    model_version,
)
from astro_fire.config import Settings
from astro_fire.manifest import Manifest, new_run_id


def run(
    settings: Settings,
    *,
    years: Sequence[int] = CALIBRATION_YEARS,
    test_years: Sequence[int] = TEST_YEARS,
    k: float | None = None,
    m: float | None = None,
    pool: str | None = None,
    counts_location: str | None = None,
) -> dict:
    years, test_years = tuple(sorted(set(years))), tuple(sorted(set(test_years)))
    overlap = sorted(set(years) & set(test_years))
    if overlap:
        raise CalibrationError(f"{overlap} are in both the calibration and the test years; they must not mix")

    location = counts_location or storage.uri(
        settings, "processed", "cell_month_counts", settings.dataset_version
    )
    run_id = new_run_id("validate")
    manifest = Manifest(run_id=run_id, pipeline="validate", settings=settings.redacted())
    con = storage.connect(settings)
    rows_in = load_counts(con, location)
    manifest.inputs.append({"path": location, "sha256": None, "rows": rows_in})

    # Calibration years only: panel, pooling weights, factors.
    gaps = find_gaps(con, "counts", years)
    excluded = sorted(set(cal.PARTIAL_REFERENCE_MONTHS) | {(y, mo) for y, mo, _ in gaps})
    excluded = [ym for ym in excluded if ym[0] in years]
    cal.build_panel(con, "counts", years, exclude_months=excluded)
    choice = choose_model(con, "panel", k=k, m=m, pool=pool)
    k, m, pool = choice["k"], choice["m"], choice["pool"]
    version_name = model_version(pool)
    cal.fit_factors(con, "panel", k=k, m=m, pool=pool, model_version=version_name)
    season = val.high_season_months(con, "panel")

    # Test years: touched only from here on, and only to score.
    test_gaps = find_gaps(con, "counts", test_years)
    test_excluded = sorted({(y, mo) for y, mo, _ in test_gaps})
    cal.build_panel(con, "counts", test_years, name="test_panel", exclude_months=test_excluded)
    val.build_eval(con, "test_panel", "factors")
    val.predict(con, "panel", "factors", "eval")
    scores = val.score(con, "predictions", season_months=season)
    decision = val.verdict(scores)

    eval_rows, eval_cells, outside = con.execute(
        "SELECT count(*), count(DISTINCT cell_l2), "
        "count(DISTINCT cell_l2) FILTER (WHERE cell_l2 NOT IN (SELECT cell_l2 FROM factors)) FROM eval"
    ).fetchone()
    span = f"{test_years[0]}–{test_years[-1]}" if len(test_years) > 1 else str(test_years[0])
    title = (
        f"Aqua → S-NPP monthly hotspot counts, test years {span} "
        f"(calibrated on {years[0]}–{years[-1]}; pooling: {pool}, K = {k:g}, M = {m:g})"
    )
    table = val.markdown_table(scores, title=title)
    notes = (
        "\nSource: NASA FIRMS active fire detections (MODIS Aqua, VIIRS S-NPP 375 m), filtered and gridded "
        "at 0.25°. Unit: detections per cell and month (MAE, RMSE); regional columns sum all cells and "
        "day + night per month. Bias = (predicted − observed) / observed over the test period. "
        f"Test rows: {eval_rows:,} ({eval_cells:,} cells).\n"
    )
    report = {
        "run_id": run_id,
        "model_version": version_name,
        "calibration_years": list(years),
        "test_years": list(test_years),
        "excluded_calibration_months": [list(ym) for ym in excluded],
        "excluded_test_months": [list(ym) for ym in test_excluded],
        "weights": {"k": k, "m": m, "pool": pool, "chosen_by": choice["chosen_by"]},
        "high_season_months": season,
        "methods": [{"key": key, "label": label, "role": role} for key, label, role in val.METHODS],
        "verdict": decision,
        "eval": {"rows": eval_rows, "cells": eval_cells, "cells_outside_calibration_universe": outside},
        "scores": scores,
    }

    target = storage.uri(settings, "artifacts", run_id)
    staging = Path(tempfile.mkdtemp(prefix="astro_validate_"))
    try:
        (staging / "metrics").mkdir()
        (staging / "reports").mkdir()
        (staging / "metrics" / "validation.json").write_text(
            json.dumps(report, indent=2, default=float) + "\n"
        )
        (staging / "reports" / "validation.md").write_text(table + notes)
        storage.publish_dir(settings, str(staging), target)
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    manifest.add_output(f"{target}/metrics/validation.json", fmt="json")
    manifest.add_output(f"{target}/reports/validation.md", fmt="markdown")
    manifest.checks = {
        "calibration_years": list(years), "test_years": list(test_years), "k": k, "m": m, "pool": pool,
        "model_version": version_name,
        "eval_rows": eval_rows,
        **{f"verdict_{key}": value for key, value in decision.items() if key != "rule"},
    }
    manifest.finish("ok" if eval_rows > 0 else "failed")
    return {
        "status": manifest.status,
        "report": f"{target}/metrics/validation.json",
        "table": f"{target}/reports/validation.md",
        "manifest": manifest.save(settings),
        "k": k, "m": m, "pool": pool,
        "verdict": decision,
        "summary": table,
    }
