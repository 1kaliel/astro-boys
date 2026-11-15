#!/usr/bin/env python3
"""Median local solar time of the detections of each satellite, by year: a check for orbit drift.

Local solar time = UTC acquisition time + longitude / 15 hours. A satellite in a maintained
sun-synchronous orbit crosses at the same local time every year; a drifting one does not, and a later
or earlier overpass changes how much of the daily fire cycle it sees.

    uv run python scripts/overpass_time.py                       # reads data/processed/hotspots/v1
    uv run python scripts/overpass_time.py gs://<bucket>/astro/processed/hotspots/v1 --json out.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import duckdb

SQL = """
WITH t AS (
    SELECT satellite, year(date_local) AS year, daynight,
           (extract(epoch FROM acq_ts_utc) / 3600.0 + longitude / 15.0 + 48) % 24 AS hour
    FROM read_parquet('{glob}', hive_partitioning = true)
    WHERE passes_main_filter
)
SELECT satellite, daynight, year, median(hour) AS median_hour, count(*) AS detections
FROM t GROUP BY ALL ORDER BY ALL
"""


def hhmm(hour: float) -> str:
    minutes = round(hour * 60) % (24 * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("hotspots", nargs="?", default="data/processed/hotspots/v1")
    parser.add_argument("--json", type=Path, help="also write the table to this JSON file")
    args = parser.parse_args()
    con = duckdb.connect()
    if args.hotspots.startswith("gs://"):
        import gcsfs  # needs the gcs extra: uv sync --extra gcs

        con.register_filesystem(gcsfs.GCSFileSystem())
    rows = con.execute(SQL.format(glob=args.hotspots.rstrip("/") + "/**/*.parquet")).fetchall()
    table: dict[str, dict[int, str]] = {}
    for satellite, daynight, year, hour, _ in rows:
        table.setdefault(f"{satellite} {'day' if daynight == 'D' else 'night'}", {})[year] = hhmm(hour)
    years = sorted({year for series in table.values() for year in series})
    print("| Satellite | " + " | ".join(str(y) for y in years) + " |")
    print("|---|" + "---|" * len(years))
    for name, series in table.items():
        print(f"| {name} | " + " | ".join(series.get(y, "") for y in years) + " |")
    if args.json:
        records = [
            {"satellite": s, "daynight": d, "year": y, "median_local_solar_time": hhmm(h), "detections": n}
            for s, d, y, h, n in rows
        ]
        args.json.write_text(json.dumps(records, indent=2) + "\n")


if __name__ == "__main__":
    main()
