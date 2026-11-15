#!/usr/bin/env bash
# Offline fallback (D12): run the dashboard container on this machine from the local data/ folder, no cloud.
# Same image and same build as Cloud Run (deploy/cloudrun/README.md); no credentials go into the container.
#
#   ./deploy/local/run-offline.sh             build the image if it is missing, then serve http://localhost:8080
#   BUILD=1 ./deploy/local/run-offline.sh     rebuild first (after pulling new data or changing the app)
#   BUILD=0 ./deploy/local/run-offline.sh     never build; run the image as it is
#
# Settings (environment): DATA_DIR (default <repo>/data), IMAGE (default astro-dashboard:offline-local),
# PORT (default 8080), DOCKER_ARGS (extra `docker run` arguments).
# Needs Docker with BuildKit, and uv to read the calendar's model_version (as deploy.sh does).
#
# Data, pulled beforehand with scripts/sync_data.sh (read-only here):
#   processed/calendar/v1        baked into the image (required)
#   processed/month_to_date/v1   baked with it; without it the unfinished month has no median (the build warns)
#   processed/hotspots/v1        optional, mounted read-only for the CSV: only the years pulled locally answer
# Offline, the basemap tiles are unavailable: the map shows the cells only. Record: docs/d12-offline-test.md
# Works in Git Bash on Windows (MSYS path conversion off, Windows paths via `pwd -W`) and on Linux/macOS.
set -euo pipefail
export MSYS_NO_PATHCONV=1

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DATA_DIR="${DATA_DIR:-$REPO_DIR/data}"
IMAGE="${IMAGE:-astro-dashboard:offline-local}"
PORT="${PORT:-8080}"
host_path() { (cd "$1" && { pwd -W 2>/dev/null || pwd; }); }   # a path Docker understands on this host

CALENDAR="$DATA_DIR/processed/calendar/v1"
TO_DATE="$DATA_DIR/processed/month_to_date/v1"
HOTSPOTS="$DATA_DIR/processed/hotspots/v1"

if [[ "${BUILD:-}" == 1 ]] || { [[ "${BUILD:-}" != 0 ]] && ! docker image inspect "$IMAGE" >/dev/null 2>&1; }; then
  ls "$CALENDAR"/*/*.parquet >/dev/null 2>&1 || { echo "No calendar in $CALENDAR (set DATA_DIR)." >&2; exit 1; }
  MODEL="$(cd "$REPO_DIR/app/backend" && uv run --quiet --project .. --frozen \
    python -m astro_dashboard.bake --print-model-version "$(host_path "$CALENDAR")")"
  contexts=(--build-context "calendar=$(host_path "$CALENDAR")")
  if [[ -d "$TO_DATE" ]]; then
    contexts+=(--build-context "month_to_date=$(host_path "$TO_DATE")")
  else
    echo "No $TO_DATE: the unfinished month will have no median." >&2
  fi
  docker build "${contexts[@]}" --build-arg "MODEL_VERSION=$MODEL" -t "$IMAGE" "$(host_path "$REPO_DIR/app")"
fi

mount=()
if [[ -d "$HOTSPOTS" ]]; then
  mount=(-v "$(host_path "$HOTSPOTS"):/data/hotspots:ro" -e ASTRO_HOTSPOTS_ROOT=/data/hotspots)
else
  echo "No $HOTSPOTS: the CSV download will answer 503 (native hotspots not available)." >&2
fi

echo "Serving $IMAGE on http://localhost:$PORT (Ctrl+C stops it)"
# shellcheck disable=SC2086  # DOCKER_ARGS is split on purpose
exec docker run --rm -p "$PORT:8080" -e PORT=8080 --memory 1g ${mount[@]+"${mount[@]}"} ${DOCKER_ARGS:-} "$IMAGE"
