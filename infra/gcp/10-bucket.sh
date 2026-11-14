#!/usr/bin/env bash
# Create the shared data bucket: private, uniform access, interim/ auto-cleanup, a managed
# folder for processed/ so the dashboard can be granted read access to processed data only.
source "$(dirname "$0")/lib.sh"
require GCP_PROJECT_ID GCS_BUCKET GCS_LOCATION GCS_PREFIX INTERIM_RETENTION_DAYS
confirm "create bucket gs://$GCS_BUCKET in $GCS_LOCATION"

run gcloud storage buckets create "gs://$GCS_BUCKET" \
  --project="$GCP_PROJECT_ID" \
  --location="$GCS_LOCATION" \
  --default-storage-class=STANDARD \
  --uniform-bucket-level-access \
  --public-access-prevention

run gcloud storage buckets update "gs://$GCS_BUCKET" \
  --update-labels=team=astro-boys,purpose=space-apps-2026

lifecycle="$(mktemp)"
cat > "$lifecycle" <<EOF
{"rule": [{"action": {"type": "Delete"},
           "condition": {"age": $INTERIM_RETENTION_DAYS, "matchesPrefix": ["$GCS_PREFIX/interim/"]}}]}
EOF
echo "   lifecycle: delete $GCS_PREFIX/interim/ objects after $INTERIM_RETENTION_DAYS days"
run gcloud storage buckets update "gs://$GCS_BUCKET" --lifecycle-file="$lifecycle"

run gcloud storage managed-folders create "gs://$GCS_BUCKET/$GCS_PREFIX/processed/"
