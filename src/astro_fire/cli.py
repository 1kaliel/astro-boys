"""Command line: `uv run astro-fire <command>`."""

from __future__ import annotations

import argparse
import json
import sys

from astro_fire import __version__, batch, calibrate, mock, smoke, storage
from astro_fire.config import get_settings


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="astro-fire", description=__doc__)
    p.add_argument("--version", action="version", version=__version__)
    p.add_argument("--data-root", help="override ASTRO_DATA_ROOT (a local path or gs://bucket/prefix)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("info", help="print resolved settings (no secrets) and the storage layout")
    s = sub.add_parser("smoke", help="CSV → DuckDB → partitioned Parquet → manifest, on sample rows")
    s.add_argument("inputs", nargs="*", help="FIRMS CSV files (default: tests/fixtures samples)")
    c = sub.add_parser("calibrate", help="cell_month_counts → factors F and B (weights by cross-validation)")
    c.add_argument("--years", default=f"{calibrate.CALIBRATION_YEARS[0]}-{calibrate.CALIBRATION_YEARS[-1]}",
                   help="calibration years, e.g. 2012-2019 (default) or 2012,2013")
    c.add_argument("--k", type=float, help="fix the pooling weight of F instead of choosing it")
    c.add_argument("--m", type=float, help="fix the pooling weight of B instead of choosing it")
    c.add_argument("--counts", help="folder with cell_month_counts Parquet "
                                    "(default: processed/cell_month_counts/<dataset version>)")
    m = sub.add_parser("mock-calendar", help="write a SYNTHETIC calendar table for dashboard development")
    m.add_argument("--bbox", default=",".join(str(v) for v in mock.DEFAULT_BBOX),
                   help="west,south,east,north in degrees; write it as --bbox=-47,-11,-44,-8")
    i = sub.add_parser("ingest", help="normalize historical Northeast FIRMS detections")
    i.add_argument("--years", default="2003-2025", help="local solar year or inclusive range (YYYY-YYYY)")
    i.add_argument("--satellites", nargs="+", choices=batch.SATELLITES, default=list(batch.SATELLITES))
    sub.add_parser("aggregate", help="aggregate hotspots into monthly counts by satellite")

    args = p.parse_args(argv)
    settings = get_settings(astro_data_root=args.data_root)

    if args.cmd == "info":
        layout = {layer: storage.uri(settings, layer) for layer in storage.LAYERS}
        info = {**settings.redacted(), "layout": layout}
        print(json.dumps(info, indent=2))
        return 0
    if args.cmd == "smoke":
        result = smoke.run(settings, args.inputs or None)
        print(json.dumps(result, indent=2))
        return 0 if result["status"] == "ok" else 1
    if args.cmd == "calibrate":
        try:
            result = calibrate.run(settings, years=calibrate.parse_years(args.years), k=args.k, m=args.m,
                                   counts_location=args.counts)
        except calibrate.CalibrationError as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
        print(json.dumps(result, indent=2))
        return 0 if result["status"] == "ok" else 1
    if args.cmd == "mock-calendar":
        try:
            west, south, east, north = (float(v) for v in args.bbox.split(","))
        except ValueError:
            p.error("--bbox needs four numbers: west,south,east,north")
        result = mock.run(settings, (west, south, east, north))
        print(json.dumps(result, indent=2))
        return 0 if result["status"] == "ok" else 1
    if args.cmd in ("ingest", "aggregate"):
        try:
            if args.cmd == "ingest":
                result = batch.ingest(settings, batch.parse_years(args.years), args.satellites)
            else:
                result = batch.aggregate(settings)
        except (OSError, ValueError) as exc:
            p.error(str(exc))
        print(json.dumps(result, indent=2))
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
