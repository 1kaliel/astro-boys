#!/usr/bin/env bash
# Build the dashboard container, push it to Artifact Registry, deploy it to Cloud Run.
# Framework-agnostic: needs only a Dockerfile in APP_DIR (default: app/) that serves HTTP on $PORT.
#
#   ./deploy/cloudrun/deploy.sh             dry run: prints every command
#   APPLY=1 ./deploy/cloudrun/deploy.sh     executes, after typing the project ID
#   BUILDER=cloudbuild ...                  build on Cloud Build instead of local Docker (no Docker/BuildKit here)
#
# Prerequisites (Kali): APIs enabled, Artifact Registry repo (infra/gcp/40-artifact-registry.sh),
# dashboard service account (infra/gcp/20-service-accounts.sh). Runbook: deploy/cloudrun/README.md
source "$(cd "$(dirname "$0")/../../infra/gcp" && pwd)/lib.sh"
require GCP_PROJECT_ID GCP_REGION AR_REPOSITORY RUN_SERVICE DASHBOARD_SA_NAME

APP_DIR="${APP_DIR:-$REPO_DIR/app}"
SERVICE_ENV="${SERVICE_ENV:-$REPO_DIR/deploy/cloudrun/service.env}"
TAG="${TAG:-$(git -C "$REPO_DIR" rev-parse --short HEAD)}"
BUILDER="${BUILDER:-docker}"
[[ "$BUILDER" == docker || "$BUILDER" == cloudbuild ]] || { echo "BUILDER must be docker or cloudbuild" >&2; exit 1; }
IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${AR_REPOSITORY}/${RUN_SERVICE}:${TAG}"

[[ -f "$APP_DIR/Dockerfile" ]] || { echo "No Dockerfile in $APP_DIR yet (Dashboard team chooses the stack first)." >&2; exit 1; }

# D8: the calendar is baked into the image from a local copy (git-ignored data/), as a named build context.
# With it goes month_to_date (60 KB): the same days of earlier years, for the unfinished month.
# The native hotspots stay in the bucket (D6).
DATASET_VERSION="${ASTRO_DATASET_VERSION:-v1}"
CALENDAR_DIR="${CALENDAR_DIR:-$REPO_DIR/data/processed/calendar/$DATASET_VERSION}"
if ! find "$CALENDAR_DIR" -name '*.parquet' -print -quit 2>/dev/null | grep -q .; then
  echo "No calendar under $CALENDAR_DIR: the image needs it baked in (D8). Pull it first:" >&2
  echo "  APPLY=1 ./scripts/sync_data.sh pull processed calendar/$DATASET_VERSION" >&2
  exit 1
fi
MODEL_VERSION="$(cd "$APP_DIR/backend" && uv run --quiet --project "$APP_DIR" --frozen \
  python -m astro_dashboard.bake --print-model-version "$CALENDAR_DIR")"
[[ -n "$MODEL_VERSION" && "$MODEL_VERSION" != *,* ]] || { echo "Calendar model_version unclear: '$MODEL_VERSION'" >&2; exit 1; }
echo "Calendar: $CALENDAR_DIR, model $MODEL_VERSION"
TO_DATE_DIR="${TO_DATE_DIR:-$REPO_DIR/data/processed/month_to_date/$DATASET_VERSION}"
if ! find "$TO_DATE_DIR" -name '*.parquet' -print -quit 2>/dev/null | grep -q .; then
  echo "No month_to_date under $TO_DATE_DIR: the unfinished month needs it for its median. Pull it first:" >&2
  echo "  APPLY=1 ./scripts/sync_data.sh pull processed month_to_date/$DATASET_VERSION" >&2
  exit 1
fi
echo "Month to date: $TO_DATE_DIR"

confirm "build $IMAGE (calendar model $MODEL_VERSION) and deploy Cloud Run service $RUN_SERVICE in $GCP_REGION"

if [[ "$BUILDER" == cloudbuild ]]; then
  # Cloud Build builds what is committed (the image tag is the commit), plus the two local data folders.
  # The first build creates the source bucket gs://${GCP_PROJECT_ID}_cloudbuild unless CLOUDBUILD_STAGING is set.
  # The build runs as a dedicated account (infra/gcp/45-build-service-account.sh): Cloud Build refuses its
  # legacy account here, and the project default (Compute Engine) has no role.
  CLOUDBUILD_SA="${CLOUDBUILD_SA:-${BUILD_SA_NAME:-astro-build}@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"
  if [[ -n "$(git -C "$REPO_DIR" status --porcelain -- "$APP_DIR")" ]]; then
    echo "Uncommitted changes under $APP_DIR are NOT in the build: Cloud Build gets commit $TAG." >&2
  fi
  STAGE="$(mktemp -d)"
  trap 'rm -rf "$STAGE"' EXIT
  if [[ "$APPLY" == "1" ]]; then
    git -C "$REPO_DIR" archive HEAD app | tar -x -C "$STAGE"
    cp -r "$CALENDAR_DIR" "$STAGE/calendar"
    cp -r "$TO_DATE_DIR" "$STAGE/month_to_date"
    echo "# everything staged here is uploaded" > "$STAGE/.gcloudignore"
  else
    echo "DRY-RUN: stage app/ (git archive HEAD), calendar/ and month_to_date/ in a temporary folder"
  fi
  staging_args=()
  [[ -n "${CLOUDBUILD_STAGING:-}" ]] && staging_args=(--gcs-source-staging-dir="$CLOUDBUILD_STAGING")
  run gcloud builds submit "$STAGE" \
    --project="$GCP_PROJECT_ID" --region="$GCP_REGION" \
    --config="$REPO_DIR/deploy/cloudrun/cloudbuild.yaml" \
    --service-account="projects/$GCP_PROJECT_ID/serviceAccounts/$CLOUDBUILD_SA" \
    --substitutions="_IMAGE=$IMAGE,_MODEL_VERSION=$MODEL_VERSION" "${staging_args[@]}"
else
  run gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet
  run docker build --platform linux/amd64 \
    --build-context "calendar=$CALENDAR_DIR" --build-context "month_to_date=$TO_DATE_DIR" \
    --build-arg "MODEL_VERSION=$MODEL_VERSION" \
    -t "$IMAGE" "$APP_DIR"
  run docker push "$IMAGE"
fi

env_args=()
if [[ -f "$SERVICE_ENV" ]]; then
  # service.env is YAML, but gcloud reads a file named *.env as KEY=VALUE lines ("expected map-like data"):
  # hand it over under a .yaml name.
  ENV_YAML="$(mktemp --suffix=.yaml)"
  cp "$SERVICE_ENV" "$ENV_YAML"
  env_args=(--env-vars-file="$ENV_YAML")
fi
auth_flag=--no-allow-unauthenticated
[[ "${RUN_ALLOW_PUBLIC:-false}" == "true" ]] && auth_flag=--allow-unauthenticated

run gcloud run deploy "$RUN_SERVICE" \
  --project="$GCP_PROJECT_ID" --region="$GCP_REGION" \
  --image="$IMAGE" \
  --service-account="$(dashboard_sa)" \
  --cpu=1 --memory=1Gi --concurrency=40 \
  --min-instances=0 --max-instances=3 \
  --timeout=300 \
  --labels=team=astro-boys,purpose=space-apps-2026 \
  "$auth_flag" "${env_args[@]}"

echo "Rollback: deploy/cloudrun/README.md#rollback"
