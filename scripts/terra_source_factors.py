#!/usr/bin/env python3
"""Factors for the months before Aqua (Nov 2000 to Jun 2002): the same method with Terra as the source.

Before July 2002 only Terra was flying, so the Aqua factors cannot be used. This script fits the frozen
method unchanged with Terra in the place of Aqua (and no witness satellite, since none existed), on the
same calibration years, and scores it on the development years. It does this by handing the pipeline a
copy of the counts and coverage tables in which Terra is labeled as the source satellite.

Writes processed/factors_terra/<v>, processed/uncertainty_terra/<v> and, under artifacts/metrics/,
calibration_terra_source.json and validation_terra_source_dev_2020-2021.{md,json}.
The final test years are not touched.

    uv run python scripts/terra_source_factors.py
"""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from pathlib import Path

import duckdb

from astro_fire import calibrate, storage, validate
from astro_fire.config import get_settings

SOURCE_LABEL = "Aqua"  # the pipeline's name for the source satellite


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--data-root", default="data")
    parser.add_argument("--artifacts", type=Path, default=Path("artifacts/metrics"))
    args = parser.parse_args()
    settings = get_settings(astro_data_root=args.data_root)
    version = settings.dataset_version
    work = Path(tempfile.mkdtemp(prefix="astro_terra_"))
    con = duckdb.connect()
    try:
        years = (calibrate.CALIBRATION_YEARS[0], calibrate.DEV_YEARS[-1])
        counts = storage.parquet_glob(storage.uri(settings, "processed", "cell_month_counts", version))
        target = work / "processed" / "cell_month_counts" / version
        target.parent.mkdir(parents=True)
        con.execute(
            f"""
            COPY (
                SELECT cell_l2, year, month, daynight,
                       CASE satellite WHEN 'Terra' THEN '{SOURCE_LABEL}' ELSE satellite END AS satellite,
                       n_hotspots
                FROM read_parquet('{counts}', hive_partitioning = true)
                WHERE satellite IN ('Terra', 'SNPP') AND year BETWEEN {years[0]} AND {years[1]}
            ) TO '{target}' (FORMAT parquet, PARTITION_BY (year))
            """
        )
        coverage = storage.parquet_glob(storage.uri(settings, "processed", "coverage_monthly", version))
        target = work / "processed" / "coverage_monthly" / version
        target.mkdir(parents=True)
        con.execute(
            f"""
            COPY (
                SELECT * REPLACE (CASE satellite WHEN 'Terra' THEN '{SOURCE_LABEL}' ELSE satellite END
                                  AS satellite)
                FROM read_parquet('{coverage}') WHERE satellite IN ('Terra', 'SNPP')
            ) TO '{target / "part-0.parquet"}' (FORMAT parquet)
            """
        )
        temp = get_settings(astro_data_root=str(work), astro_dataset_version=version)
        fit = calibrate.run(temp, witness=False)
        scored = validate.run(temp, witness=False)
        label = f"{fit['model_version']}-terra-source"
        for table in ("factors", "uncertainty"):
            out = Path(storage.uri(settings, "processed", f"{table}_terra", version))
            shutil.rmtree(out, ignore_errors=True)
            out.mkdir(parents=True)
            select = "* REPLACE ($label AS model_version)" if table == "factors" else "*"
            con.execute(
                f"COPY (SELECT {select} FROM read_parquet('{fit[table]}/part-0.parquet')) "
                f"TO '{out / 'part-0.parquet'}' (FORMAT parquet, COMPRESSION zstd)",
                {"label": label} if table == "factors" else {},
            )
        args.artifacts.mkdir(parents=True, exist_ok=True)
        shutil.copy(fit["report"], args.artifacts / "calibration_terra_source.json")
        shutil.copy(scored["report"], args.artifacts / "validation_terra_source_dev_2020-2021.json")
        table_text = Path(scored["table"]).read_text().replace(
            "Aqua → S-NPP monthly hotspot counts", "Terra → S-NPP monthly hotspot counts"
        ).replace("MODIS Aqua, VIIRS", "MODIS Terra, VIIRS").replace("Raw Aqua counts", "Raw Terra counts")
        (args.artifacts / "validation_terra_source_dev_2020-2021.md").write_text(table_text)
        print(table_text)
        summary = {key: fit[key] for key in ("k", "m", "pool", "witness", "reconcile_lambda", "cells",
                                             "overall_ratio", "excluded_months")}
        print(json.dumps({"model_version": label, **summary, "verdict": {
            k: v for k, v in scored["verdict"].items() if k != "rule"}}, indent=2, default=float))
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
