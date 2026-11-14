# infra/gcp

Scripts that set up the Google Cloud environment. **All are dry runs by default**: they print the `gcloud`
commands and change nothing. `APPLY=1` executes them after you type the project ID.

| Script | Does | Changes IAM | Costs |
|--------|------|-------------|-------|
| `00-preflight.sh` | Read-only checks: config, gcloud, project, billing, APIs, bucket | No | No |
| `05-enable-apis.sh` | Enable the APIs we use | No | No |
| `10-bucket.sh` | Private bucket, interim/ lifecycle, `processed/` managed folder | No | Storage |
| `20-service-accounts.sh` | Pipeline + dashboard service accounts, bucket-scoped roles | **Yes** | No |
| `25-team-access.sh` | Team roles per [iam-and-access.md](../../docs/cloud/iam-and-access.md) | **Yes** | No |
| `30-vm.sh` | IAP-only SSH firewall rule + pipeline VM | No | VM hours + disk |
| `40-artifact-registry.sh` | Docker repository for the dashboard | No | Image storage |
| `vm-control.sh` | `status`, `start`, `stop`, `ssh` | No | Start = billing |
| `vm/bootstrap.sh` | Run **on the VM**: tools, repo, env, smoke test, idle shutdown | No | No |

Config: copy `gcp.env.example` → `gcp.env` (git-ignored). Order and context: [docs/cloud/README.md](../../docs/cloud/README.md).
