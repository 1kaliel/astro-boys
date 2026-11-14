"""Smoke test of the toolchain: CSV in → DuckDB → partitioned Parquet out → read back → manifest.

This is NOT the harmonization method. It only proves that reading FIRMS CSVs, writing partitioned
Parquet and recording a manifest work the same way locally and on the VM. Columns are carried over
as-is with a `sensor` provenance column; no confidence mapping, filtering or calibration happens here.
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from astro_fire import storage
from astro_fire.config import REPO_ROOT, Settings
from astro_fire.manifest import Manifest, new_run_id

FIXTURES = REPO_ROOT / "tests" / "fixtures"
DEFAULT_INPUTS = [
    FIXTURES / "modis_2024_Brazil_sample.csv",
    FIXTURES / "viirs-jpss1_2024_Brazil_sample.csv",
]

# Columns both FIRMS products share. Sensor-specific brightness fields are left out of the smoke output.
COMMON = (
    "latitude, longitude, scan, track, acq_date, acq_time, satellite, instrument, "
    "CAST(confidence AS VARCHAR) AS confidence_raw, CAST(version AS VARCHAR) AS version, "
    "frp, daynight, type"
)


def _select_for(path: str) -> str:
    name = Path(path).name.lower()
    sensor = "MODIS" if name.startswith("modis") else "VIIRS"
    return (
        f"SELECT '{sensor}' AS sensor, {COMMON}, '{Path(path).name}' AS source_file, "
        "year(acq_date) AS year, month(acq_date) AS month "
        f"FROM read_csv('{path}', header = true, types = {{'acq_date': 'DATE', 'acq_time': 'VARCHAR'}})"
    )


def run(settings: Settings, inputs: list[str] | None = None) -> dict:
    inputs = [str(p) for p in (inputs or DEFAULT_INPUTS)]
    run_id = new_run_id("smoke")
    manifest = Manifest(run_id=run_id, pipeline="smoke", settings=settings.redacted())
    con = storage.connect(settings)

    union = " UNION ALL BY NAME ".join(_select_for(p) for p in inputs)
    con.execute(f"CREATE TEMP TABLE hotspots AS {union}")
    for p in inputs:
        n = con.execute(f"SELECT count(*) FROM read_csv('{p}', header = true)").fetchone()[0]
        manifest.add_input(p, rows=n)
    rows_in = con.execute("SELECT count(*) FROM hotspots").fetchone()[0]

    # Always write to a local staging dir, then move/upload: same code path for local and GCS.
    target = storage.uri(settings, "interim", "smoke", run_id)
    staging = Path(tempfile.mkdtemp(prefix="astro_smoke_"))
    try:
        out = staging / "hotspots"
        con.execute(
            f"COPY hotspots TO '{out}' (FORMAT parquet, PARTITION_BY (sensor, year, month), COMPRESSION zstd)"
        )
        rows_back = con.execute(
            f"SELECT count(*) FROM read_parquet('{out}/**/*.parquet', hive_partitioning = true)"
        ).fetchone()[0]
        partitions = sorted(p.relative_to(out).as_posix() for p in out.glob("*/*/*") if p.is_dir())

        if settings.is_remote:
            storage.upload_dir(str(out), f"{target}/hotspots")
        else:
            Path(target).mkdir(parents=True, exist_ok=True)
            shutil.copytree(out, Path(target) / "hotspots", dirs_exist_ok=True)
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    manifest.add_output(f"{target}/hotspots", rows=rows_back)
    manifest.checks = {
        "rows_in": rows_in,
        "rows_read_back": rows_back,
        "row_count_matches": rows_in == rows_back,
        "partitions": partitions,
        "sensors": [r[0] for r in con.execute("SELECT DISTINCT sensor FROM hotspots ORDER BY 1").fetchall()],
    }
    manifest.finish("ok" if rows_in == rows_back and rows_in > 0 else "failed")

    manifest_dir = storage.uri(settings, "manifests")
    if settings.is_remote:
        local_dir = tempfile.mkdtemp(prefix="astro_manifest_")
        manifest_path = manifest.write(local_dir)
        storage.upload_dir(local_dir, manifest_dir)
        manifest_path = f"{manifest_dir}/{Path(manifest_path).name}"
    else:
        manifest_path = manifest.write(manifest_dir)
    return {"status": manifest.status, "manifest": manifest_path, **manifest.checks}
