# Pipeline VM runbook

## Sizing

| Option | vCPU / RAM | When |
|--------|-----------|------|
| **`e2-standard-4` (default)** | 4 / 16 GB | Full global MODIS + VIIRS processing with DuckDB; good parallelism |
| `e2-highmem-2` | 2 / 16 GB | Cheaper; same memory, slower |
| `e2-standard-2` | 2 / 8 GB | Single region / few years only |

- **Disk:** 100 GB `pd-balanced`. Zipped raw is ~5 GB (MODIS + NOAA-20, ~10 GB with S-NPP); unzipped CSVs are
  several times larger; Parquet is much smaller. DuckDB spills to `DUCKDB_TEMP_DIR` when RAM runs out.
- **DuckDB memory limit:** ~60% of RAM (`DUCKDB_MEMORY_LIMIT=10GB` on 16 GB). The bootstrap sets this.
- **Spot VM** (`VM_PROVISIONING=SPOT`): much cheaper, but Google can stop it at any time. Fine for restartable
  batch steps; not for a long run right before a deadline.

Check current hourly prices for the chosen region in the [pricing calculator](https://cloud.google.com/products/calculator).

## Create and bootstrap

```bash
./infra/gcp/30-vm.sh                       # dry run
APPLY=1 ./infra/gcp/30-vm.sh               # create (Kali)
./infra/gcp/vm-control.sh ssh              # SSH through IAP
# on the VM:
curl -fsSL https://raw.githubusercontent.com/1kaliel/astro-boys/main/infra/gcp/vm/bootstrap.sh -o bootstrap.sh
less bootstrap.sh && bash bootstrap.sh
```

The bootstrap installs git + uv (pinned), clones the repo, runs `uv sync --frozen --extra gcs`, writes a cloud
`.env`, runs the smoke test, and installs the idle auto-shutdown. It is safe to re-run (it pulls the latest code).

## Daily use

```bash
./infra/gcp/vm-control.sh status
APPLY=1 ./infra/gcp/vm-control.sh start
./infra/gcp/vm-control.sh ssh
# on the VM:
cd ~/astro-boys && git pull && uv sync --frozen --extra gcs
tmux new -s pipeline                       # long runs survive a dropped connection
APPLY=1 ./scripts/sync_data.sh pull raw firms
uv run astro-fire ...                      # pipeline commands (to come)
APPLY=1 ./scripts/sync_data.sh push processed
APPLY=1 ./scripts/sync_data.sh push manifests
```

## Shutdown: three safety nets

1. **Stop it yourself** when done: `APPLY=1 ./infra/gcp/vm-control.sh stop` (or `sudo poweroff` on the VM).
2. **Idle auto-shutdown:** powers off after 30 minutes with no SSH session and no pipeline process
   (`astro-fire`, `firms_download`, `duckdb`, `gcloud storage`, `pytest`). Change with `IDLE_MINUTES` in bootstrap.
   A detached tmux session with nothing running counts as idle.
3. **Max run duration:** the VM is stopped after 12 hours of continuous running (`VM_MAX_RUN_DURATION`).

A stopped VM costs nothing for CPU/RAM; its disk is still billed until the VM is deleted.

## After the hackathon

Copy anything worth keeping to the bucket, then delete the VM (and its disk):
`gcloud compute instances delete "$VM_NAME" --zone "$GCP_ZONE" --project "$GCP_PROJECT_ID"`.
