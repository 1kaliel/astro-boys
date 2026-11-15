# Runbook: all of Brazil as dataset v2 (local)

Status: **experimental, local only.** The pilot (`v1`, Northeast Brazil) stays the default and is not touched: every
output below goes to `.../v2`, and the pipeline refuses to overwrite an existing folder. Nothing here writes to the
bucket, the VM or Cloud Run; publishing v2 is a separate decision for Kali (team decision Q6 in
[project-plan.md](project-plan.md) locked the pilot to the Northeast).

Requested by Justino on 2026-11-15; to be run by Cleber, who has the disk space. Written with an AI assistant
(Claude Code); see [resources.md](resources.md).

## What changes with the extent

| | `ASTRO_EXTENT=northeast` (default) | `ASTRO_EXTENT=brazil` |
|---|---|---|
| Box (west, south, east, north) | -48.8, -18.4, -34.7, -1.0 | -74.0, -34.0, -28.0, 6.0 |
| Historical archives | Brazil per-country CSV, trimmed to the box | Brazil per-country CSV (the box only trims) |
| 2026 area API | rows in the box | rows in the box **and** in cells where the historical Brazil files have detections (the API answers by box, so neighbours would leak in; border cells keep a few foreign pixels) |
| Dashboard | default build | build with `VITE_ASTRO_EXTENT=brazil` |

The method is the frozen one (`fb-l1-terra-rec-4`: K = 50, M = 5, pooling at the 1° parent cell, Terra-aware
background, reconciliation 0.75). For v2 it is **re-fitted on Brazil but not re-selected**: pass the frozen values,
so the 2022–2023 final test is not used again to choose anything. The validation numbers of v2 are new numbers for a
new region and must be reported as such, next to the Northeast ones, not instead of them.

## Needs

- About **12 GB free**: 9.8 GB of global FIRMS zips (`raw/firms/global`), about 3–5 GB of Brazil hotspots Parquet,
  the rest small. 8 GB of RAM or more (`DUCKDB_MEMORY_LIMIT=4GB` is a safe start).
- Read access to the bucket with your own gcloud login (`gcloud auth login`); nothing is written to it.
- `MAP_KEY` in `.env` (FIRMS area API, for 2026).

## Steps

From the repository root, on a branch that has these changes.

```bash
export ASTRO_EXTENT=brazil ASTRO_DATASET_VERSION=v2 DUCKDB_MEMORY_LIMIT=4GB

# 1. Historical archives (read-only pull, ~9.8 GB, data/ is git-ignored)
GCS_BUCKET=astro-boys-data-301238386836 APPLY=1 ./scripts/sync_data.sh pull raw firms/global
#    Smaller alternative: the Brazil per-country CSVs straight from FIRMS (no key), which ingest reads first:
#    python3 scripts/firms_download.py country --country Brazil --years 2003-2025 --dry-run   # sizes
#    python3 scripts/firms_download.py country --country Brazil --years 2003-2025

# 2. 2026 from the FIRMS area API, for the Brazil box (the four windows of batch.API_2026_WINDOWS)
B=-74.0,-34.0,-28.0,6.0
python3 scripts/firms_download.py api --source VIIRS_SNPP_SP    --bbox $B --start 2026-01-01 --end 2026-07-31
python3 scripts/firms_download.py api --source VIIRS_SNPP_NRT   --bbox $B --start 2026-08-01 --end 2026-11-02
python3 scripts/firms_download.py api --source VIIRS_NOAA20_SP  --bbox $B --start 2026-01-01 --end 2026-07-31
python3 scripts/firms_download.py api --source VIIRS_NOAA20_NRT --bbox $B --start 2026-08-01 --end 2026-11-14
#    The chunks land in raw/firms/api/<SOURCE>/-74.0_-34.0_-28.0_6.0/; ingest-api reads only that folder.
#    Use the same end dates as v1 (or later ones, then update API_2026_WINDOWS in the same commit).

# 3. Pipeline (same years as v1: check `local_years` in the v1 ingest manifest under data/manifests/)
uv run astro-fire ingest --years 2003-2025
uv run astro-fire aggregate
uv run astro-fire ingest-api --year 2026
uv run astro-fire coverage
uv run astro-fire calibrate --k 50 --m 5 --pool l1 --witness on --reconcile 0.75
uv run astro-fire harmonize
uv run astro-fire validate --k 50 --m 5 --pool l1 --witness on --reconcile 0.75

# 4. Dashboard on v2
(cd app && ASTRO_DATA_ROOT=../data ASTRO_DATASET_VERSION=v2 \
   uv run uvicorn --app-dir backend astro_dashboard.main:app --port 8080) &
(cd app/frontend && VITE_ASTRO_EXTENT=brazil npm run dev)
```

Open http://localhost:5173. The Detections layer reads `processed/hotspots/v2` the same way (set
`ASTRO_HOTSPOTS_ROOT` if it lives elsewhere).

## Checks before anyone uses v2

1. `ingest` manifest: `rows_outside_bbox_dropped` is small (the per-country files are already Brazil).
2. The Northeast cells of v2 give the same native counts as v1 (`raw_snpp`, `raw_aqua` of a few months).
3. `coverage` finds the known gaps (August 2020 Aqua, the S-NPP outages) on the larger region too.
4. The 2026 months: compare the API counts with the archive on an overlapping date if one exists.
5. Memory: v1 uses about 290 MiB of the 1 GiB Cloud Run instance; v2 has about 7 times as many cells. Measure the
   backend's memory with v2 before proposing a deploy.
6. Log the run with `./scripts/log.sh done` (run ids, row counts, validation table) and say that it is v2.
