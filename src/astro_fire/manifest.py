"""Run manifests: what went in, what came out, and with which code and settings."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import subprocess
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import duckdb

from astro_fire import __version__, storage
from astro_fire.config import REPO_ROOT, Settings


def new_run_id(name: str) -> str:
    stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"{stamp}_{name}_{uuid.uuid4().hex[:6]}"


def git_commit() -> str:
    try:
        out = subprocess.run(["git", "-C", str(REPO_ROOT), "rev-parse", "--short", "HEAD"],
                             capture_output=True, text=True, check=True)
        dirty = subprocess.run(["git", "-C", str(REPO_ROOT), "status", "--porcelain"],
                               capture_output=True, text=True).stdout.strip()
        return out.stdout.strip() + ("-dirty" if dirty else "")
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def sha256(path: str) -> str | None:
    p = Path(path)
    if not p.is_file():  # missing, a directory or a gs:// URI
        return None
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


@dataclass
class Manifest:
    run_id: str
    pipeline: str
    settings: dict[str, str]
    started_utc: str = field(default_factory=lambda: dt.datetime.now(dt.UTC).isoformat(timespec="seconds"))
    finished_utc: str | None = None
    code_version: str = field(default_factory=lambda: f"{__version__} ({git_commit()})")
    duckdb_version: str = duckdb.__version__
    inputs: list[dict] = field(default_factory=list)
    outputs: list[dict] = field(default_factory=list)
    checks: dict[str, object] = field(default_factory=dict)
    status: str = "running"

    def add_input(self, path: str, rows: int | None = None) -> None:
        self.inputs.append({"path": path, "sha256": sha256(path), "rows": rows})

    def add_output(self, path: str, rows: int | None = None, fmt: str = "parquet") -> None:
        self.outputs.append({"path": path, "rows": rows, "format": fmt})

    def finish(self, status: str = "ok") -> None:
        self.status = status
        self.finished_utc = dt.datetime.now(dt.UTC).isoformat(timespec="seconds")

    def write(self, directory: str) -> str:
        Path(directory).mkdir(parents=True, exist_ok=True)
        path = Path(directory) / f"{self.run_id}.json"
        path.write_text(json.dumps(self.__dict__, indent=2, default=str) + "\n")
        return str(path)

    def save(self, settings: Settings) -> str:
        """Write the manifest to the `manifests/` layer of the data root and return its path."""
        directory = storage.uri(settings, "manifests")
        if not settings.is_remote:
            return self.write(directory)
        local_dir = tempfile.mkdtemp(prefix="astro_manifest_")
        name = Path(self.write(local_dir)).name
        storage.upload_dir(local_dir, directory)
        return f"{directory}/{name}"
