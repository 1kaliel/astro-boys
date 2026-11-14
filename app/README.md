# Dashboard app (Team Dashboard)

**Owner:** Cleber, Guilherme, Jean. **Stack: your choice**, logged as a `DECISION` in the diary.

## What it must do (from the challenge brief)

Full spec: [docs/spec/dashboard.md](../docs/spec/dashboard.md). Tasks and owners: [docs/tasks.md](../docs/tasks.md).

- Select an area (draw on a map, or enter lat/lon) and a date range.
- Burning calendar: hotspot counts by month × year, early 2000s → present, with an accessible color ramp.
- Current month vs the historical median; trends; anomalies.
- Download the hotspots in the search as CSV, plus charts/analytics.
- Show source (NASA FIRMS), period, units and limitations.

## Data

Read the harmonized outputs from `processed/` (schema: [docs/data-dictionary.md](../docs/data-dictionary.md),
layout: [docs/cloud/storage-layout.md](../docs/cloud/storage-layout.md)). Until they exist, build against the
sample the Harmonization team shares, or run `uv run astro-fire smoke` for a tiny partitioned Parquet example
in `data/interim/smoke/`.

## Deployment

Target: **Cloud Run**. The container contract (serve on `$PORT`, stateless, read-only data, `/healthz`) and the
deploy script are in [deploy/cloudrun/README.md](../deploy/cloudrun/README.md). Put your `Dockerfile` in this folder.

## Replace this README

When you scaffold the app, keep the sections above (updated) and add: how to install, run locally, test, and deploy.
