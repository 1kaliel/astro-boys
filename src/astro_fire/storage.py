"""Storage layout and DuckDB connections, identical for local disk and Cloud Storage.

Layout (under the data root, see docs/cloud/storage-layout.md):

  raw/        immutable source files, exactly as downloaded
  interim/    disposable intermediate results
  processed/  versioned, partitioned Parquet that the dashboard reads
  artifacts/  run outputs: metrics, figures, reports
  manifests/  one JSON per pipeline run: inputs, outputs, code version, settings
"""

from __future__ import annotations

import shutil
from pathlib import Path

import duckdb

from astro_fire.config import Settings

LAYERS = ("raw", "interim", "processed", "artifacts", "manifests")


def uri(settings: Settings, layer: str, *parts: str) -> str:
    """Path or gs:// URI for a location inside a layer."""
    if layer not in LAYERS:
        raise ValueError(f"unknown layer {layer!r}; expected one of {LAYERS}")
    return "/".join([settings.data_root, layer, *[p.strip("/") for p in parts if p]])


def ensure_local_dir(path: str) -> None:
    if not path.startswith("gs://"):
        Path(path).mkdir(parents=True, exist_ok=True)


def _gcs_filesystem():
    try:
        import gcsfs
    except ImportError as e:
        raise RuntimeError("gs:// paths need the gcs extra: uv sync --extra gcs") from e
    return gcsfs.GCSFileSystem()


def connect(settings: Settings) -> duckdb.DuckDBPyConnection:
    """DuckDB connection with memory limits that fit the machine, spilling to disk when needed."""
    ensure_local_dir(settings.duckdb_temp_dir)
    con = duckdb.connect()
    con.execute(f"SET memory_limit = '{settings.duckdb_memory_limit}'")
    con.execute(f"SET temp_directory = '{settings.duckdb_temp_dir}'")
    if settings.duckdb_threads:
        con.execute(f"SET threads = {settings.duckdb_threads}")
    if settings.is_remote:
        # Application Default Credentials: the VM service account, or `gcloud auth application-default login`.
        # No HMAC keys or key files.
        con.register_filesystem(_gcs_filesystem())
    return con


def upload_dir(local_dir: str, remote_uri: str) -> None:
    """Copy a local directory tree to gs://. Writes are staged locally first, then uploaded."""
    fs = _gcs_filesystem()
    fs.put(local_dir.rstrip("/") + "/", remote_uri.rstrip("/") + "/", recursive=True)


def publish_dir(settings: Settings, local_dir: str, target: str, *, replace: bool = False) -> None:
    """Copy a locally staged directory to `target` under the data root (local disk or gs://).

    `replace` removes a previous local copy first; in Cloud Storage same-named objects are overwritten.
    """
    if settings.is_remote:
        upload_dir(local_dir, target)
        return
    if replace:
        shutil.rmtree(target, ignore_errors=True)
    Path(target).parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(local_dir, target, dirs_exist_ok=True)


def parquet_glob(location: str) -> str:
    """Glob for every Parquet file of a dataset folder."""
    return location.rstrip("/") + "/**/*.parquet"
