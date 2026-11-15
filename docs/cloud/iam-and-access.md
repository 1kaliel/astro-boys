# Access: least privilege

Rules:

- **No service-account keys.** People authenticate with their own Google accounts (`gcloud auth login`,
  `gcloud auth application-default login`); the VM and Cloud Run use their attached service accounts.
- **No basic roles** (Owner/Editor/Viewer) for anyone except the project owner (Kali).
- **Grant on the resource, not the project**, wherever Google Cloud allows it (bucket, managed folder, VM,
  repository, service account).
- **Every IAM change is made by Kali** with the dry-run-first scripts, and logged in the diary.

## Service accounts

Created by [`infra/gcp/20-service-accounts.sh`](../../infra/gcp/20-service-accounts.sh).

| Account | Attached to | Roles | Scope |
|---------|-------------|-------|-------|
| `astro-pipeline` | Pipeline VM | `roles/storage.objectUser` (read/write objects, no IAM or bucket admin) | The data bucket |
| | | `roles/logging.logWriter`, `roles/monitoring.metricWriter` | Project (needed for VM logs/metrics) |
| `astro-dashboard` | Cloud Run service | `roles/storage.objectViewer` | Managed folder `processed/` only |
| `astro-build` | Cloud Build, dashboard image build ([`45-build-service-account.sh`](../../infra/gcp/45-build-service-account.sh)) | `roles/storage.objectViewer` | Cloud Build source bucket `<project>_cloudbuild` |
| | | `roles/artifactregistry.writer` | Repository `astro` only |
| | | `roles/logging.logWriter` | Project (build logs) |

## People

Granted by [`infra/gcp/25-team-access.sh`](../../infra/gcp/25-team-access.sh) from the member lists in `gcp.env`.

| Who | Needs to | Roles | Scope |
|-----|----------|-------|-------|
| **Kali** | Own the project, billing, IAM | Owner, Billing Account User | Project / billing account |
| **Harmonization** (Justino, Mateus) | Read/write data | `roles/storage.objectUser` | Data bucket |
| | Start, stop, SSH into the VM | `roles/compute.instanceAdmin.v1` | The VM only |
| | Log in via OS Login through IAP | `roles/compute.osLogin`, `roles/iap.tunnelResourceAccessor` | Project |
| | Use the VM's service account | `roles/iam.serviceAccountUser` | `astro-pipeline` SA only |
| **Dashboard** (Cleber, Guilherme, Jean) | Read processed data | `roles/storage.objectViewer` | Managed folder `processed/` |
| | Push images | `roles/artifactregistry.writer` | The `astro` repository |
| | Deploy revisions | `roles/run.developer` | Project |
| | Deploy as the runtime SA | `roles/iam.serviceAccountUser` | `astro-dashboard` SA only |

Nobody but Kali can change IAM, delete the bucket, or touch billing.

## What's still broader than ideal (accepted for a 2-day hackathon)

- `roles/run.developer` is project-wide (it can be narrowed to the service once it exists).
- `roles/compute.osLogin` and `iap.tunnelResourceAccessor` are project-wide (only one VM exists).
- Harmonization members can overwrite objects outside `raw/`; `raw/` is protected by process (no-clobber
  pushes) and bucket soft delete, not by IAM.

## Removing access after the event

Run the same `gcloud ... remove-iam-policy-binding` commands as in the scripts, or delete the project.
