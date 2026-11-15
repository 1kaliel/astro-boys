# 0004: Google Cloud as the primary environment, local as fallback; Python + DuckDB + Parquet

- **Date:** 2026-11-14 14:55 UTC
- **Status:** accepted (architecture); resources not yet created
- **Deciders:** Kali

## Context

The team already holds ~4.8 GB of zipped global FIRMS data (MODIS 2000–2025, VIIRS NOAA-20 2018–2025), more
when unzipped. Team laptops are small (the coordinator machine has 5 GB RAM). Six people need shared data, and
the judges need a public dashboard URL. The challenge lists only FIRMS as a resource, so infrastructure is our call.

## Decision

1. **Google Cloud is the shared/production environment.**
   - **Cloud Storage** holds shared `raw/`, `interim/`, `processed/`, `artifacts/`, `manifests/`.
   - A **Compute Engine VM** (default `e2-standard-4`, 16 GB) runs the harmonization pipeline.
   - The dashboard's deployment target is **Cloud Run**; the Dashboard team still chooses its framework.
2. **Pipeline stack: Python + DuckDB**, managed with **uv** (locked dependencies). DuckDB processes data larger
   than RAM by spilling to disk, so the same code runs on a laptop and on the VM.
3. **Outputs: partitioned Parquet** (Hive-style, versioned folders) plus a **JSON manifest per run**.
4. **Local execution stays the fallback** and the development path. No cloud-only processing code: the VM
   syncs data to its disk and runs the same commands. Reading `gs://` directly is optional (`gcs` extra).
5. **No BigQuery** for now: not needed at this data size, and it would split the code path. Revisit only if the
   dashboard needs interactive SQL over all raw hotspots.

## Options considered

| Option | Why not (now) |
|--------|---------------|
| Laptops only | 5–8 GB RAM, slow shared data via Drive, no public URL |
| BigQuery as the processing engine | Cloud-only path, harder offline fallback, query costs; DuckDB covers the size |
| Azure (also a Global Offer) | No advantage for us; one cloud is enough |
| pandas/geopandas pipeline | Global yearly files don't fit in laptop memory |

## Consequences

- Kali creates the project, billing, budget alert and resources, step by step, with the dry-run-first
  scripts in `infra/gcp/`. Nothing exists yet.
- Least-privilege service accounts and team roles (team-internal IAM notes, removed before submission).
- Costs are capped by VM auto-stop, Cloud Run max instances and a budget alert.
- Google Cloud is a deviation from the challenge's suggested tools (it lists only FIRMS); recorded in
  the team's suggested-tools notes (removed before submission).
