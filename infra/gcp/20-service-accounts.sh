#!/usr/bin/env bash
# Create the two service accounts and grant them the minimum they need.
# IAM CHANGE: run only after Kali approves. See docs/cloud/iam-and-access.md.
source "$(dirname "$0")/lib.sh"
require GCP_PROJECT_ID GCS_BUCKET GCS_PREFIX PIPELINE_SA_NAME DASHBOARD_SA_NAME
PIPE_SA="$(pipeline_sa)"
DASH_SA="$(dashboard_sa)"
confirm "create service accounts $PIPE_SA and $DASH_SA and grant bucket-scoped roles"

run gcloud iam service-accounts create "$PIPELINE_SA_NAME" --project="$GCP_PROJECT_ID" \
  --display-name="Astro pipeline VM"
run gcloud iam service-accounts create "$DASHBOARD_SA_NAME" --project="$GCP_PROJECT_ID" \
  --display-name="Astro dashboard (Cloud Run runtime)"

# Pipeline VM: read/write objects in OUR bucket only (no bucket admin, no IAM changes).
run gcloud storage buckets add-iam-policy-binding "gs://$GCS_BUCKET" \
  --member="serviceAccount:$PIPE_SA" --role=roles/storage.objectUser
# Pipeline VM: write its own logs and metrics.
run gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:$PIPE_SA" --role=roles/logging.logWriter --condition=None
run gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:$PIPE_SA" --role=roles/monitoring.metricWriter --condition=None

# Dashboard runtime: read processed/ only, via the managed folder.
run gcloud storage managed-folders add-iam-policy-binding "gs://$GCS_BUCKET/$GCS_PREFIX/processed/" \
  --member="serviceAccount:$DASH_SA" --role=roles/storage.objectViewer

echo "No service-account keys are created. The VM and Cloud Run use these accounts directly."
