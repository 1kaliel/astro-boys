# Shared helpers for infra/gcp scripts. Source it; don't run it.
#
# Safety model:
#   - Every script is a DRY RUN by default: it prints the gcloud commands and changes nothing.
#   - APPLY=1 executes them, after you type the project ID to confirm.
#   - Scripts refuse to run while gcp.env still contains <placeholders>.
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$INFRA_DIR/../.." && pwd)"
ENV_FILE="${GCP_ENV_FILE:-$INFRA_DIR/gcp.env}"
APPLY="${APPLY:-0}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy infra/gcp/gcp.env.example to infra/gcp/gcp.env and fill it in." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

require() {
  local missing=0 v val
  for v in "$@"; do
    val="${!v:-}"
    if [[ -z "$val" || "$val" == *"<"*">"* ]]; then
      echo "Set $v in $ENV_FILE (currently '${val}')" >&2
      missing=1
    fi
  done
  [[ $missing -eq 0 ]] || exit 1
}

pipeline_sa() { echo "${PIPELINE_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"; }
dashboard_sa() { echo "${DASHBOARD_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"; }

run() {
  if [[ "$APPLY" == "1" ]]; then
    echo "+ $*"
    "$@"
  else
    printf 'DRY-RUN:'
    printf ' %q' "$@"
    echo
  fi
}

confirm() {
  # $1: what is about to happen
  if [[ "$APPLY" != "1" ]]; then
    echo "== Dry run: $1"
    echo "== Nothing will change. Review the commands, then re-run with APPLY=1."
    return
  fi
  command -v gcloud >/dev/null || { echo "gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install" >&2; exit 1; }
  echo "== APPLY: $1"
  echo "== Project: $GCP_PROJECT_ID"
  read -r -p "Type the project ID to continue: " answer
  [[ "$answer" == "$GCP_PROJECT_ID" ]] || { echo "Aborted." >&2; exit 1; }
}
