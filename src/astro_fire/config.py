"""Runtime settings, read from environment variables (and an optional .env file).

The same code runs locally and on the VM. Only the data root changes:
  ASTRO_DATA_ROOT=data                     local (default)
  ASTRO_DATA_ROOT=gs://<bucket>/<prefix>   Cloud Storage (needs the `gcs` extra)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def load_dotenv(path: Path | None = None) -> None:
    """Load KEY=VALUE lines into os.environ without overriding variables already set."""
    path = path or REPO_ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(frozen=True)
class Settings:
    data_root: str
    profile: str
    duckdb_memory_limit: str
    duckdb_threads: int | None
    duckdb_temp_dir: str
    dataset_version: str

    @property
    def is_remote(self) -> bool:
        return self.data_root.startswith("gs://")

    def redacted(self) -> dict[str, str]:
        """Settings safe to print or store in a manifest (contains no secrets)."""
        return {
            "data_root": self.data_root,
            "profile": self.profile,
            "duckdb_memory_limit": self.duckdb_memory_limit,
            "duckdb_threads": str(self.duckdb_threads or "auto"),
            "duckdb_temp_dir": self.duckdb_temp_dir,
            "dataset_version": self.dataset_version,
        }


def get_settings(**overrides: str) -> Settings:
    load_dotenv()
    env = {**os.environ, **{k.upper(): v for k, v in overrides.items() if v is not None}}
    root = (env.get("ASTRO_DATA_ROOT") or "data").rstrip("/")
    if not root.startswith("gs://") and not Path(root).is_absolute():
        root = str(REPO_ROOT / root)
    threads = (env.get("DUCKDB_THREADS") or "").strip()
    return Settings(
        data_root=root,
        profile=env.get("ASTRO_PROFILE") or "local",
        duckdb_memory_limit=env.get("DUCKDB_MEMORY_LIMIT") or "2GB",
        duckdb_threads=int(threads) if threads else None,
        duckdb_temp_dir=env.get("DUCKDB_TEMP_DIR") or str(REPO_ROOT / "data" / "interim" / ".duckdb_tmp"),
        dataset_version=env.get("ASTRO_DATASET_VERSION") or "v0",
    )
