#!/usr/bin/env python3
"""Sensitivity of the method to the confidence filter (task H12).

Reruns calibration (2012-2019) and the development-year validation (2020-2021) with three definitions of
a counted detection, all of type 0:

    nominal_high   nominal and high confidence   (the main filter)
    all            low, nominal and high
    high           high confidence only

The method and its selection rules are identical in the three runs; only the counts change. The final test
years are not touched. Writes artifacts/metrics/filter_sensitivity.md and .json.

    uv sync --extra gcs
    uv run python scripts/filter_sensitivity.py gs://<bucket>/astro/processed/hotspots/v1
"""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from pathlib import Path

import duckdb

from astro_fire import calibrate, validate
from astro_fire import validation as val
from astro_fire.config import get_settings

VARIANTS = {
    "nominal_high": "passes_main_filter",
    "all": "type = 0",
    "high": "type = 0 AND confidence_class = 'h'",
}
YEARS = (2012, 2021)  # calibration and development years only


def variant_counts(hotspots: str, out: Path) -> None:
    con = duckdb.connect()
    if hotspots.startswith("gs://"):
        import gcsfs

        con.register_filesystem(gcsfs.GCSFileSystem())
    selects = ", ".join(f"count(*) FILTER (WHERE {where}) AS n_{name}" for name, where in VARIANTS.items())
    con.execute(
        f"""
        CREATE TABLE c AS
        SELECT cell_l2, year(date_local)::INT AS year, month(date_local)::INT AS month, daynight, satellite,
               {selects}
        FROM read_parquet('{hotspots.rstrip("/")}/**/*.parquet', hive_partitioning = true)
        WHERE satellite IN ('Aqua', 'SNPP', 'Terra') AND year(date_local) BETWEEN {YEARS[0]} AND {YEARS[1]}
        GROUP BY ALL
        """
    )
    for name in VARIANTS:
        target = out / name / "processed" / "cell_month_counts" / "v1"
        target.parent.mkdir(parents=True)
        con.execute(
            f"COPY (SELECT cell_l2, year, month, daynight, satellite, n_{name} AS n_hotspots FROM c "
            f"WHERE n_{name} > 0) TO '{target}' (FORMAT parquet, PARTITION_BY (year))"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("hotspots", nargs="?", default="data/processed/hotspots/v1")
    parser.add_argument("--coverage", default="data/processed/coverage_monthly/v1")
    parser.add_argument("--out", type=Path, default=Path("artifacts/metrics/filter_sensitivity"))
    args = parser.parse_args()
    work = Path(tempfile.mkdtemp(prefix="astro_sensitivity_"))
    rows = []
    try:
        variant_counts(args.hotspots, work)
        for name in VARIANTS:
            root = work / name
            shutil.copytree(args.coverage, root / "processed" / "coverage_monthly" / "v1")
            settings = get_settings(astro_data_root=str(root), astro_dataset_version="v1")
            fit = calibrate.run(settings)
            report = json.loads(Path(validate.run(settings)["report"]).read_text())
            scores = {(s["method"], s["level"]): s for s in report["scores"] if s["split"] == "all"}
            final_cell, final_region = scores[val.FINAL, "cell_month"], scores[val.FINAL, "region_month"]
            best_cell = min((scores[b, "cell_month"] for b in val.BASELINES), key=lambda s: s["mae"])
            best_region = min((scores[b, "region_month"] for b in val.BASELINES), key=lambda s: s["mae"])
            verdict = report["verdict"]
            rows.append({
                "filter": name, "definition": VARIANTS[name],
                "viirs_over_aqua": fit["overall_ratio"], "cells": fit["cells"],
                "pool": fit["pool"], "k": fit["k"], "m": fit["m"], "witness": fit["witness"],
                "reconcile_lambda": fit["reconcile_lambda"],
                "final_cell_mae": final_cell["mae"], "best_baseline_cell_mae": best_cell["mae"],
                "final_cell_rmse": final_cell["rmse"],
                "best_baseline_cell_rmse": min(scores[b, "cell_month"]["rmse"] for b in val.BASELINES),
                "final_bias": final_cell["bias_rel"],
                "final_region_mae": final_region["mae"], "best_baseline_region_mae": best_region["mae"],
                "regional_difference_ci90": [verdict["regional_difference"]["ci90_low"],
                                             verdict["regional_difference"]["ci90_high"]],
                "passes_rule": verdict["accepted"],
                "interval_coverage_90pct": report["interval_coverage_90pct"][0]["inside"],
            })
    finally:
        shutil.rmtree(work, ignore_errors=True)

    lines = [
        "### Sensitivity to the confidence filter, development years 2020–2021",
        "",
        "| Filter | VIIRS / Aqua | Model chosen | MAE cell-month (best baseline) | RMSE (best baseline) "
        "| Bias | MAE regional month (best baseline) | Passes the rule | Interval coverage |",
        "|---|---:|---|---:|---:|---:|---:|---|---:|",
    ]
    for r in rows:
        model = (f"{r['pool']}, K={r['k']:g}, M={r['m']:g}, "
                 f"{'Terra-aware' if r['witness'] else 'static'}, λ={r['reconcile_lambda']:g}")
        lines.append(
            f"| {r['filter']} | {r['viirs_over_aqua']:.2f} | {model} | "
            f"{r['final_cell_mae']:.2f} ({r['best_baseline_cell_mae']:.2f}) | "
            f"{r['final_cell_rmse']:.2f} ({r['best_baseline_cell_rmse']:.2f}) | {r['final_bias']:+.1%} | "
            f"{r['final_region_mae']:,.0f} ({r['best_baseline_region_mae']:,.0f}) | "
            f"{'yes' if r['passes_rule'] else 'no'} | {r['interval_coverage_90pct']:.1%} |"
        )
    lines += [
        "",
        "Source: NASA FIRMS detections (MODIS Aqua and Terra, VIIRS S-NPP), type 0, pilot bounding box; "
        "calibrated on 2012–2019, scored on 2020–2021 with months of satellite outage left out. Unit: "
        "detections per cell and month. The final test years (2022–2023) were not used.",
        "",
    ]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.with_suffix(".md").write_text("\n".join(lines))
    args.out.with_suffix(".json").write_text(json.dumps(rows, indent=2, default=float) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
