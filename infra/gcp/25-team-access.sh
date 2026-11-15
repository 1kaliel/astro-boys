#!/usr/bin/env bash
# Grant teammates the access their team needs, and nothing project-wide beyond that.
# IAM CHANGE: run only after Kali approves the member list.
source "$(dirname "$0")/lib.sh"
require GCP_PROJECT_ID GCP_REGION GCP_ZONE GCS_BUCKET GCS_PREFIX VM_NAME AR_REPOSITORY \
        PIPELINE_SA_NAME DASHBOARD_SA_NAME HARMONIZATION_MEMBERS DASHBOARD_MEMBERS
PIPE_SA="$(pipeline_sa)"
DASH_SA="$(dashboard_sa)"
confirm "grant team access (Harmonization: $HARMONIZATION_MEMBERS; Dashboard: $DASHBOARD_MEMBERS)"

IFS=',' read -ra HARM <<<"$HARMONIZATION_MEMBERS"
IFS=',' read -ra DASH <<<"$DASHBOARD_MEMBERS"

for m in "${HARM[@]}"; do
  m="$(echo "$m" | xargs)"
  # Data: read/write objects in our bucket.
  run gcloud storage buckets add-iam-policy-binding "gs://$GCS_BUCKET" --member="$m" --role=roles/storage.objectUser
  # VM: start/stop/SSH this one VM via IAP, as an OS Login user.
  run gcloud compute instances add-iam-policy-binding "$VM_NAME" --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID" \
    --member="$m" --role=roles/compute.instanceAdmin.v1
  run gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="$m" --role=roles/compute.osLogin --condition=None
  run gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="$m" --role=roles/iap.tunnelResourceAccessor --condition=None
  # Needed to log in to a VM that runs as the pipeline service account.
  run gcloud iam service-accounts add-iam-policy-binding "$PIPE_SA" --project="$GCP_PROJECT_ID" \
    --member="$m" --role=roles/iam.serviceAccountUser
done

for m in "${DASH[@]}"; do
  m="$(echo "$m" | xargs)"
  # Data: read processed outputs only.
  run gcloud storage managed-folders add-iam-policy-binding "gs://$GCS_BUCKET/$GCS_PREFIX/processed/" \
    --member="$m" --role=roles/storage.objectViewer
  # Push container images to our repository only.
  run gcloud artifacts repositories add-iam-policy-binding "$AR_REPOSITORY" --location="$GCP_REGION" \
    --project="$GCP_PROJECT_ID" --member="$m" --role=roles/artifactregistry.writer
  # Deploy Cloud Run revisions that run as the dashboard service account.
  run gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" --member="$m" --role=roles/run.developer --condition=None
  run gcloud iam service-accounts add-iam-policy-binding "$DASH_SA" --project="$GCP_PROJECT_ID" \
    --member="$m" --role=roles/iam.serviceAccountUser
done
