# Data

Data files are **not** committed. Only this README, `raw/SOURCES.md` and folder placeholders are tracked.

| Folder | Contents | Rules |
|--------|----------|-------|
| `raw/` | Original downloads (FIRMS, etc.) | **Immutable.** Never edit. Log every download in `raw/SOURCES.md`. |
| `interim/` | Intermediate results | Disposable; must be regenerable from `raw/` by a script. |
| `processed/` | Harmonized, versioned, partitioned Parquet | `processed/<dataset>/<version>/<key=value>/...`. Schema in `docs/data-dictionary.md`. |
| `artifacts/` | Run outputs: metrics, figures, reports | Per run ID. Curated copies for the demo go in the repo's top-level `artifacts/`. |
| `manifests/` | One JSON per pipeline run | Written by `astro-fire`; inputs with SHA-256, outputs, row counts, git commit. |

This folder mirrors the shared bucket `gs://<GCS_BUCKET>/astro/` ([layout](../docs/cloud/storage-layout.md)). Sync with `scripts/sync_data.sh`. Keep download scripts in `scripts/` so anyone can rebuild.
