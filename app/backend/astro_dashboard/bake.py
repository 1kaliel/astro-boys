"""The calendar baked into the image (task D8): check it at build time and record what it is.

Only `processed/calendar/<version>` goes into the image (about 24 MB). It enters through a named build
context (`docker build --build-context calendar=data/processed/calendar/v1`, see deploy/cloudrun/deploy.sh),
so the data never goes into git or into the app/ build context. The native hotspots (hotspots/v1, 883 MB)
stay in the bucket.

    python -m astro_dashboard.bake --print-model-version <calendar folder>
        Print the model_version of a local calendar (deploy.sh passes it as the MODEL_VERSION build argument).

    python -m astro_dashboard.bake --check <data root> [--expect-model-version X] [--allow-empty]
        Load the calendar the way the app does, fail if it is missing or its model_version is not X, and write
        <data root>/build-info.json, which the app serves at /api/version.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import duckdb

from astro_dashboard.calendar import CalendarStore

BUILD_INFO = "build-info.json"


def model_version_of(calendar_folder: Path) -> str:
    """The model_version values of a calendar folder, comma-separated (one value for a coherent release)."""
    files = list(calendar_folder.glob("**/*.parquet"))
    if not files:
        raise FileNotFoundError(f"No calendar Parquet files under {calendar_folder}")
    glob = (calendar_folder / "**" / "*.parquet").as_posix()
    rows = duckdb.execute(
        "SELECT DISTINCT model_version FROM read_parquet(?, hive_partitioning = true) ORDER BY 1", [glob]
    ).fetchall()
    return ",".join(r[0] for r in rows if r[0])


def check(data_root: Path, dataset_version: str, expect: str | None, allow_empty: bool) -> dict:
    folder = data_root / "processed" / "calendar" / dataset_version
    info: dict = {
        "dataset": f"calendar/{dataset_version}",
        "built_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if not any(folder.glob("**/*.parquet")):
        if not allow_empty:
            raise SystemExit(
                f"No calendar in the image ({folder}). Build with "
                "--build-context calendar=data/processed/calendar/v1, or pass "
                "--build-arg ALLOW_NO_CALENDAR=1 for an image without data."
            )
        info.update(model_version=None, rows=0, first_year=None, last_year=None)
    else:
        store = CalendarStore.from_data_root(data_root, dataset_version)
        if not store.model_version:
            raise SystemExit("The calendar has no model_version.")
        if "," in store.model_version:
            raise SystemExit(f"The calendar mixes model versions: {store.model_version}")
        if expect and store.model_version != expect:
            raise SystemExit(f"The calendar is model {store.model_version}, the build expected {expect}.")
        info.update(
            model_version=store.model_version,
            rows=store.rows,
            first_year=store.first_year,
            last_year=store.last_year,
            files=sum(1 for _ in folder.glob("**/*.parquet")),
            bytes=sum(p.stat().st_size for p in folder.glob("**/*.parquet")),
        )
    (data_root / BUILD_INFO).write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")
    return info


def read_build_info(data_root: str | Path) -> dict | None:
    """The build-info.json written by `--check`, or None outside an image built with it."""
    path = Path(data_root) / BUILD_INFO
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--print-model-version", type=Path, metavar="CALENDAR_FOLDER")
    mode.add_argument("--check", type=Path, metavar="DATA_ROOT")
    parser.add_argument("--dataset-version", default="v1")
    parser.add_argument("--expect-model-version", default=None)
    parser.add_argument("--allow-empty", action="store_true")
    args = parser.parse_args(argv)

    if args.print_model_version is not None:
        print(model_version_of(args.print_model_version))
        return 0
    info = check(args.check, args.dataset_version, args.expect_model_version or None, args.allow_empty)
    print(json.dumps(info), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
