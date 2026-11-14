#!/usr/bin/env bash
# Create the Docker repository the Dashboard team pushes images to (Cloud Run pulls from it).
source "$(dirname "$0")/lib.sh"
require GCP_PROJECT_ID GCP_REGION AR_REPOSITORY
confirm "create Artifact Registry Docker repository $AR_REPOSITORY in $GCP_REGION"

run gcloud artifacts repositories create "$AR_REPOSITORY" --project="$GCP_PROJECT_ID" \
  --location="$GCP_REGION" --repository-format=docker \
  --description="Astro dashboard images" --labels=team=astro-boys,purpose=space-apps-2026
