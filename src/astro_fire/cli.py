"""Command line: `uv run astro-fire <command>`."""

from __future__ import annotations

import argparse
import json
import sys

from astro_fire import __version__, smoke, storage
from astro_fire.config import get_settings


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="astro-fire", description=__doc__)
    p.add_argument("--version", action="version", version=__version__)
    p.add_argument("--data-root", help="override ASTRO_DATA_ROOT (a local path or gs://bucket/prefix)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("info", help="print resolved settings (no secrets) and the storage layout")
    s = sub.add_parser("smoke", help="CSV → DuckDB → partitioned Parquet → manifest, on sample rows")
    s.add_argument("inputs", nargs="*", help="FIRMS CSV files (default: tests/fixtures samples)")

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
    return 2


if __name__ == "__main__":
    sys.exit(main())
