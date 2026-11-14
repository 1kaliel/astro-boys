# Storage layout

The same tree exists in Cloud Storage and on every machine. Code addresses it through
`astro_fire.storage.uri(settings, layer, ...)`, so switching between them is one setting:

| Where | `ASTRO_DATA_ROOT` |
|-------|-------------------|
| Laptop / VM disk | `data` (default, git-ignored) |
| Cloud Storage | `gs://<GCS_BUCKET>/astro` |

## Layers

| Layer | Contents | Rules | Who writes |
|-------|----------|-------|------------|
| `raw/` | Source files exactly as downloaded | **Immutable.** Never edited or overwritten (`sync_data.sh push raw` uses no-clobber). Every file logged in `data/raw/SOURCES.md` | Harmonization |
| `interim/` | Unzipped CSVs, staging, smoke runs, DuckDB spill | Disposable; regenerable from `raw/`. Auto-deleted in GCS after 14 days | Pipeline |
| `processed/` | Versioned, partitioned Parquet: the data contract with the dashboard | New version = new folder; never edit a published version | Pipeline |
| `artifacts/` | Run outputs: metrics, figures, validation reports | Per run ID | Pipeline |
| `manifests/` | One JSON per run: inputs (with SHA-256), outputs, row counts, git commit, settings | Append-only | Pipeline |

## Paths

```text
<root>/
├── raw/
│   └── firms/
│       ├── global/{sensor}/{sensor}_{YYYY}_all_countries.zip      # yearly global zips (team Drive copy)
│       ├── country/{sensor}/{sensor}_{YYYY}_{Country}.csv         # yearly per-country CSVs
│       └── api/{SOURCE}/{bbox}/{YYYY-MM-DD}_{N}d.csv              # area API chunks (2026, NOAA-21)
├── interim/
│   ├── unzipped/{sensor}/{YYYY}/...
│   ├── smoke/{run_id}/...
│   └── .duckdb_tmp/
├── processed/
│   └── {dataset}/{version}/{partition columns}/part-*.parquet
│       e.g. hotspots/v1/sensor=MODIS/year=2024/month=1/...
├── artifacts/{run_id}/{metrics,figures,reports}/...
└── manifests/{run_id}.json
```

`sensor` values: `modis`, `viirs-snpp`, `viirs-jpss1` (NOAA-20), `viirs-jpss2` (NOAA-21), matching FIRMS names.

## Parquet conventions

- **Hive partitioning** (`key=value` folders); readers use `hive_partitioning = true`.
- **Partition by what the dashboard filters on most**, typically `year` and `month` (and `sensor` for
  harmonization-stage data). Avoid partitions with tiny files: aim for files of 10–200 MB.
- **ZSTD compression.** Coordinates as DOUBLE, dates as DATE, times as UTC.
- **Version folders** (`v1`, `v2`, …) match `ASTRO_DATASET_VERSION`. The dashboard pins a version; the
  previous version stays for rollback.
- The exact schema of each dataset is the data contract in [../data-dictionary.md](../data-dictionary.md).

## The repo's `artifacts/` vs the data root's `artifacts/`

- `data/artifacts/` (and `gs://…/artifacts/`): every run's full outputs. Not committed.
- Repo `artifacts/`: a few **curated, small** figures and metric tables chosen for the demo and the write-up. Committed.
