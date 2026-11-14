# Cloud setup: Google Cloud primary, local fallback

Decision: [ADR 0004](../decisions/0004-gcp-primary-local-fallback.md). Owner: Kali.

```text
                 ┌──────────────────────── Google Cloud project ────────────────────────┐
FIRMS ──HTTPS──▶ │  Cloud Storage bucket  gs://<bucket>/astro/                          │
(Drive copy)     │    raw/  interim/  processed/  artifacts/  manifests/                │
                 │        ▲  sync (gcloud storage)          │ read-only (processed/)    │
                 │        ▼                                  ▼                           │
                 │  Compute Engine VM (16 GB)          Cloud Run: dashboard             │
                 │  uv + Python + DuckDB pipeline      (any framework, container)       │
                 └───────────────────────────────────────────────────────────────────────┘
                          ▲ same code, same commands
Laptop (fallback / dev): uv + Python + DuckDB on data/ (small samples or a pilot area)
```

## Principles

- **One codebase, two places.** `astro-fire` runs the same locally and on the VM. Only `ASTRO_DATA_ROOT`
  and the DuckDB memory limit change. No cloud-only processing code.
- **Sync, then process.** The VM pulls inputs from the bucket to its disk, processes locally with DuckDB,
  and pushes outputs back. Reading `gs://` directly is supported (`--extra gcs`) for small reads.
- **Open formats.** Partitioned Parquet + JSON manifests. No BigQuery: the data fits a 16 GB VM with DuckDB,
  and avoiding it keeps the laptop fallback identical. Revisit only if the dashboard needs ad-hoc SQL over
  all raw hotspots at interactive speed.
- **Safe by default.** Every infra script is a dry run unless `APPLY=1`, and asks for the project ID to confirm.
  No service-account keys anywhere. Costs are controlled by VM auto-stop, Cloud Run scale-to-zero/max instances,
  lifecycle rules and a budget alert; Google Cloud budgets are alerts, not a universal hard spending cap.

## Live status (2026-11-14)

- Project `astro-boys`, region `us-central1`, zone `us-central1-a`.
- Private bucket `gs://astro-boys-data-301238386836` with public access prevention and 14-day cleanup for
  `astro/interim/`.
- Pipeline and dashboard service accounts exist without downloaded keys.
- `astro-pipeline-vm` is bootstrapped, smoke-tested and **stopped**. Idle shutdown is installed for future runs.
- Artifact Registry repository `astro` is ready and empty.
- Cloud Run is enabled but no service is deployed; deployment waits for the Dashboard team to supply a runnable
  container/Dockerfile.
- No FIRMS data was uploaded. That step is assigned to the data collaborator.

## Docs

| Topic | File |
|-------|------|
| Bucket and local folder layout | [storage-layout.md](storage-layout.md) |
| VM sizing, bootstrap, start/stop, auto-shutdown | [vm-runbook.md](vm-runbook.md) |
| Service accounts, team access, least privilege | [iam-and-access.md](iam-and-access.md) |
| Budget alert checklist and cost guidance | [budget-and-cost.md](budget-and-cost.md) |
| Offline fallback and rollback | [fallback-and-rollback.md](fallback-and-rollback.md) |
| Dashboard deployment | [../../deploy/cloudrun/README.md](../../deploy/cloudrun/README.md) |

## Setup order (Kali, when ready; each step asks before changing anything)

| # | Step | Command | Cost |
|---|------|---------|------|
| 0 | Install gcloud CLI, `gcloud auth login`, `gcloud auth application-default login` | [install guide](https://cloud.google.com/sdk/docs/install) | Free |
| 1 | Create or pick the project, link billing, set a budget alert | Cloud Console; [budget-and-cost.md](budget-and-cost.md) | Free |
| 2 | Fill in `infra/gcp/gcp.env` from `gcp.env.example` | | |
| 3 | Preflight (read-only) | `./infra/gcp/00-preflight.sh` | Free |
| 4 | Enable APIs | `APPLY=1 ./infra/gcp/05-enable-apis.sh` | Free |
| 5 | Bucket | `APPLY=1 ./infra/gcp/10-bucket.sh` | Storage per GB-month |
| 6 | Service accounts (IAM) | `APPLY=1 ./infra/gcp/20-service-accounts.sh` | Free |
| 7 | VM | `APPLY=1 ./infra/gcp/30-vm.sh` | Per hour while running + disk |
| 8 | Artifact Registry (for the dashboard) | `APPLY=1 ./infra/gcp/40-artifact-registry.sh` | Storage per GB |
| 9 | Team access (IAM) | `APPLY=1 ./infra/gcp/25-team-access.sh` | Free |
| 10 | Upload raw data from the Drive copy | `APPLY=1 ./scripts/sync_data.sh push raw firms` | Upload is free |
| 11 | Bootstrap the VM | `./infra/gcp/vm-control.sh ssh`, then `infra/gcp/vm/bootstrap.sh` | |

Run each without `APPLY=1` first and read the printed commands.

## Choosing a region

Kali decides; put it in `infra/gcp/gcp.env`. Keep the bucket, VM, Artifact Registry and Cloud Run in the **same
region** to avoid inter-region transfer charges and latency.

| Option | For | Against |
|--------|-----|---------|
| `southamerica-east1` (São Paulo) | Lowest latency for the team and Brazilian users | Higher prices than US regions |
| A US region, e.g. `us-central1` | Usually the lowest prices; widest service availability | Higher latency from Brazil (fine for batch and a demo) |

Check current prices in the [pricing calculator](https://cloud.google.com/products/calculator) before choosing.
