#!/usr/bin/env bash
# Enable the Google Cloud APIs this project uses. Enabling is free; usage is billed.
source "$(dirname "$0")/lib.sh"
require GCP_PROJECT_ID
confirm "enable Storage, Compute, IAM, IAP, Cloud Run, Artifact Registry and Cloud Build APIs"

run gcloud services enable \
  storage.googleapis.com compute.googleapis.com iam.googleapis.com iap.googleapis.com \
  run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  --project="$GCP_PROJECT_ID"
