#!/usr/bin/env bash
# Create the service account Cloud Build runs the dashboard image build as, with the minimum it needs.
# Only needed for `BUILDER=cloudbuild ./deploy/cloudrun/deploy.sh` (machines without Docker and BuildKit).
# IAM CHANGE: run only after Kali approves.
#
# Cloud Build does not accept its legacy account (<number>@cloudbuild.gserviceaccount.com) as an explicit
# build account, and the project default (the Compute Engine account) has no role, on purpose.
# Run it after the first `gcloud builds submit` created the source bucket gs://<project>_cloudbuild.
source "$(dirname "$0")/lib.sh"
require GCP_PROJECT_ID GCP_REGION AR_REPOSITORY
BUILD_SA_NAME="${BUILD_SA_NAME:-astro-build}"
BUILD_SA="${BUILD_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
SOURCE_BUCKET="${CLOUDBUILD_SOURCE_BUCKET:-gs://${GCP_PROJECT_ID}_cloudbuild}"
confirm "create service account $BUILD_SA and let it read $SOURCE_BUCKET, push to $AR_REPOSITORY and write logs"

run gcloud iam service-accounts create "$BUILD_SA_NAME" --project="$GCP_PROJECT_ID" \
  --display-name="Astro dashboard image build (Cloud Build)"

# Read the uploaded source (app + calendar) from the Cloud Build source bucket only.
run gcloud storage buckets add-iam-policy-binding "$SOURCE_BUCKET" \
  --member="serviceAccount:$BUILD_SA" --role=roles/storage.objectViewer
# Push the image to OUR repository only.
run gcloud artifacts repositories add-iam-policy-binding "$AR_REPOSITORY" --project="$GCP_PROJECT_ID" \
  --location="$GCP_REGION" --member="serviceAccount:$BUILD_SA" --role=roles/artifactregistry.writer
# Write its build logs (cloudbuild.yaml uses CLOUD_LOGGING_ONLY).
run gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \
  --member="serviceAccount:$BUILD_SA" --role=roles/logging.logWriter --condition=None

echo "No keys are created. Whoever submits a build needs roles/iam.serviceAccountUser on $BUILD_SA."
