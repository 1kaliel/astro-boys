# Offline fallback and rollback

Google Cloud is the shared environment, not a single point of failure. Everything the demo needs must be
reproducible on a laptop.

## When to fall back

| Situation | Signal | Response |
|-----------|--------|----------|
| GCP project or billing not ready | Setup not done by the time processing must start | Work locally on a pilot area (below); move to the cloud later |
| VM unavailable (quota, Spot stop, zone issue) | Can't start / keeps stopping | Retry another zone or `STANDARD`; meanwhile run locally on a smaller area/period |
| Bucket unreachable | `gcloud storage` errors | Use local `data/` and the team Drive copy of the raw zips |
| Cloud Run deploy fails or the URL breaks | Deploy error, 5xx | Roll back the revision; if still broken, run the container locally |
| Out of budget | Budget alert at 90–100% | Stop the VM; keep Cloud Run at scale-to-zero; finish locally |

## Running the dashboard offline

`./deploy/local/run-offline.sh` builds the Cloud Run image from the local `data/` (calendar and `month_to_date` baked
in) and serves it on http://localhost:8080 with the local `hotspots/v1` mounted read-only. Tested with the external
network cut: everything works except the basemap tiles (the map shows the cells only) and the CSV of years not pulled
locally (a clear 503). Record, commands and limits: [D12 offline test](../d12-offline-test.md).

## Running the pipeline locally

Same code, smaller data. On a 5–8 GB laptop:

```bash
uv sync --group dev
# .env: ASTRO_DATA_ROOT=data, DUCKDB_MEMORY_LIMIT=2GB (4GB on 8 GB machines)
uv run astro-fire smoke                 # toolchain check
# raw data: the team Drive copy, or a pilot area:
python3 scripts/firms_download.py country --country Brazil --years 2018-2025
```

Use one country/region and a few years. DuckDB spills to disk rather than crashing; keep `DUCKDB_MEMORY_LIMIT`
at ~50–60% of RAM.

## Rollback

| What | How |
|------|-----|
| Processed data | Point the dashboard back to the previous version folder (`ASTRO_DATASET_VERSION`), redeploy or set the env var |
| Dashboard | `gcloud run services update-traffic ... --to-revisions=<previous>=100` (see [Cloud Run runbook](../../deploy/cloudrun/README.md#rollback)) |
| Code | `git revert` the bad commit; the VM picks it up with `git pull` |
| Deleted/overwritten object | Bucket soft delete (default retention) lets you restore recent deletions |
| Raw data | Immutable in the bucket, plus the team Drive copy, plus FIRMS itself |

## Demo insurance (by Sun 19:00 local)

- [ ] Screenshots of every key view in `artifacts/screenshots/`.
- [ ] The demo video recorded from whichever environment works.
- [x] A local build of the dashboard that runs from `data/` with no network ([D12 offline test](../d12-offline-test.md)).
