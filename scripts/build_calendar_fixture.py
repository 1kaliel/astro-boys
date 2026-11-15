"""Build the dashboard's calendar fixture from the SYNTHETIC mock calendar.

The frontend (app/frontend/src/data/calendarSource.ts) reads one small JSON file until task D2 serves the
real `calendar/v1` from the backend. This script sums the mock's cells into one monthly series per period
(ALL, D, N), the shape of an area query, and writes the compact JSON.

    uv run astro-fire mock-calendar                      # writes data/processed/calendar/mock/
    uv run python scripts/build_calendar_fixture.py      # writes the fixture

Everything in the output is synthetic (`model_version = MOCK`). It is for building screens only and must
never appear in a figure, the demo or the submission. The 90% interval follows the data contract: variances
of the summed cells add (docs/data-dictionary.md, rules for consumers).
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import duckdb

REPO = Path(__file__).resolve().parent.parent
DEFAULT_SRC = REPO / "data" / "processed" / "calendar" / "mock"
DEFAULT_OUT = REPO / "app" / "frontend" / "src" / "data" / "fixtures" / "calendar-mock.json"

# Must match FIXTURE_COLUMNS in app/frontend/src/data/calendarSource.ts.
COLUMNS = [
    "year", "month", "period", "count", "ci_low", "ci_high", "is_estimated", "is_partial", "days_observed",
]
Z_90 = 1.645


def build(src: Path) -> dict:
    con = duckdb.connect()
    rows = con.execute(
        f"""
        SELECT year, month, period,
               round(sum(count_harmonized), 1) AS count,
               sum(var_harmonized) AS var,
               bool_or(is_estimated) AS est, bool_or(is_partial) AS part, max(days_observed) AS days,
               count(*) AS n_cells,
               min(lon_min) AS west, min(lat_min) AS south, max(lon_max) AS east, max(lat_max) AS north
        FROM read_parquet('{src}/**/*.parquet', hive_partitioning = true)
        GROUP BY year, month, period ORDER BY year, month, period
        """
    ).fetchall()
    if not rows:
        raise SystemExit(f"No mock rows under {src}. Run: uv run astro-fire mock-calendar")
    body = []
    for year, month, period, count, var, est, part, days, *_ in rows:
        half = Z_90 * math.sqrt(var or 0.0)
        body.append(
            [year, month, period, count, round(max(0.0, count - half), 1), round(count + half, 1),
             int(bool(est)), int(bool(part)), int(days)]
        )
    bounds = [
        min(r[9] for r in rows), min(r[10] for r in rows),
        max(r[11] for r in rows), max(r[12] for r in rows),
    ]  # west, south, east, north
    return {
        "synthetic": True,
        "model_version": "MOCK",
        "note": "SYNTHETIC numbers from `astro-fire mock-calendar`, summed over the mock block. "
        "For building screens only.",
        "bbox": bounds,
        "cells": max(r[8] for r in rows),
        "columns": COLUMNS,
        "rows": body,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--src", type=Path, default=DEFAULT_SRC, help="mock calendar folder (Parquet)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="fixture JSON to write")
    args = parser.parse_args()
    doc = build(args.src)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, separators=(",", ":")))
    print(f"{len(doc['rows'])} rows, {doc['cells']} cells -> {args.out}")


if __name__ == "__main__":
    main()
