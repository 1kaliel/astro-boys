#!/usr/bin/env bash
# Build the dashboard container, push it to Artifact Registry, deploy it to Cloud Run.
# Framework-agnostic: needs only a Dockerfile in APP_DIR (default: app/) that serves HTTP on $PORT.
#
#   ./deploy/cloudrun/deploy.sh             dry run: prints every command
#   APPLY=1 ./deploy/cloudrun/deploy.sh     executes, after typing the project ID
#
# Prerequisites (Kali): APIs enabled, Artifact Registry repo (infra/gcp/40-artifact-registry.sh),
# dashboard service account (infra/gcp/20-service-accounts.sh). Runbook: deploy/cloudrun/README.md
source "$(cd "$(dirname "$0")/../../infra/gcp" && pwd)/lib.sh"
require GCP_PROJECT_ID GCP_REGION AR_REPOSITORY RUN_SERVICE DASHBOARD_SA_NAME

APP_DIR="${APP_DIR:-$REPO_DIR/app}"
SERVICE_ENV="${SERVICE_ENV:-$REPO_DIR/deploy/cloudrun/service.env}"
TAG="${TAG:-$(git -C "$REPO_DIR" rev-parse --short HEAD)}"
IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPOSITORY}/${RUN_SERVICE}:${TAG}"

[[ -f "$APP_DIR/Dockerfile" ]] || { echo "No Dockerfile in $APP_DIR yet (Dashboard team chooses the stack first)." >&2; exit 1; }
confirm "build $IMAGE and deploy Cloud Run service $RUN_SERVICE in $GCP_REGION"

run gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet
run docker build --platform linux/amd64 -t "$IMAGE" "$APP_DIR"
run docker push "$IMAGE"

env_args=()
[[ -f "$SERVICE_ENV" ]] && env_args=(--env-vars-file="$SERVICE_ENV")
auth_flag=--no-allow-unauthenticated
[[ "${RUN_ALLOW_PUBLIC:-false}" == "true" ]] && auth_flag=--allow-unauthenticated

run gcloud run deploy "$RUN_SERVICE" \
  --project="$GCP_PROJECT_ID" --region="$GCP_REGION" \
  --image="$IMAGE" \
  --service-account="$(dashboard_sa)" \
  --cpu=1 --memory=1Gi --concurrency=40 \
  --min-instances=0 --max-instances=3 \
  --timeout=60 \
  --labels=team=astro-boys,purpose=space-apps-2026 \
  "$auth_flag" "${env_args[@]}"

echo "Rollback: deploy/cloudrun/README.md#rollback"
