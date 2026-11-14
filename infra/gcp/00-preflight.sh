#!/usr/bin/env bash
# Read-only checks. Changes nothing, costs nothing.
source "$(dirname "$0")/lib.sh"

echo "== Config file: $ENV_FILE"
require GCP_PROJECT_ID GCP_REGION GCP_ZONE GCS_LOCATION GCS_BUCKET GCS_PREFIX PIPELINE_SA_NAME DASHBOARD_SA_NAME
echo "   placeholders: none left"

if ! command -v gcloud >/dev/null; then
  echo "!! gcloud CLI not installed: https://cloud.google.com/sdk/docs/install"
  exit 1
fi
echo "== gcloud: $(gcloud --version 2>/dev/null | head -1)"
echo "== Active account: $(gcloud config get-value account 2>/dev/null)"

if gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectId)' >/dev/null 2>&1; then
  echo "== Project $GCP_PROJECT_ID: reachable"
  billing=$(gcloud billing projects describe "$GCP_PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || echo unknown)
  echo "   billing enabled: $billing"
  echo "== Enabled APIs we need:"
  enabled=$(gcloud services list --enabled --project "$GCP_PROJECT_ID" --format='value(config.name)' 2>/dev/null || true)
  for api in storage.googleapis.com compute.googleapis.com iam.googleapis.com iap.googleapis.com \
             run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com; do
    if grep -qx "$api" <<<"$enabled"; then echo "   [x] $api"; else echo "   [ ] $api"; fi
  done
else
  echo "!! Project $GCP_PROJECT_ID not reachable with the active account."
fi

if gcloud storage buckets describe "gs://$GCS_BUCKET" --format='value(name)' >/dev/null 2>&1; then
  echo "== Bucket gs://$GCS_BUCKET: exists"
else
  echo "== Bucket gs://$GCS_BUCKET: not found (create with 10-bucket.sh)"
fi
