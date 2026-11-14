#!/usr/bin/env bash
# Mirror a data layer between Cloud Storage and the local data/ folder.
#
#   ./scripts/sync_data.sh pull <layer> [subpath]   gs://$GCS_BUCKET/$GCS_PREFIX/<layer>/... → data/<layer>/...
#   ./scripts/sync_data.sh push <layer> [subpath]   data/<layer>/... → gs://...
#
# Layers: raw | interim | processed | artifacts | manifests
# DRY RUN by default (prints the command). APPLY=1 to run.
# raw is immutable: pushes never overwrite existing objects, and nothing is ever deleted.
# Pulling to a laptop is internet egress (billed per GB): pull only what you need.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
for f in "$REPO/.env" "$REPO/infra/gcp/gcp.env"; do
  # shellcheck disable=SC1090
  [[ -f "$f" ]] && { set -a; source "$f"; set +a; }
done
GCS_PREFIX="${GCS_PREFIX:-astro}"

dir="${1:-}"; layer="${2:-}"; sub="${3:-}"
case "$layer" in raw|interim|processed|artifacts|manifests) ;; *)
  echo "usage: $0 pull|push raw|interim|processed|artifacts|manifests [subpath]" >&2; exit 2 ;; esac
[[ -n "${GCS_BUCKET:-}" && "$GCS_BUCKET" != *"<"* ]] || { echo "Set GCS_BUCKET in .env or infra/gcp/gcp.env" >&2; exit 1; }

remote="gs://$GCS_BUCKET/$GCS_PREFIX/$layer${sub:+/$sub}"
local_path="$REPO/data/$layer${sub:+/$sub}"
mkdir -p "$local_path"

case "$dir" in
  pull) cmd=(gcloud storage rsync --recursive "$remote" "$local_path") ;;
  push)
    if [[ "$layer" == "raw" ]]; then
      # Copy the folder into its parent so gs://.../raw/<sub> mirrors data/raw/<sub>.
      cmd=(gcloud storage cp --recursive --no-clobber "$local_path" "${remote%/*}/")
    else
      cmd=(gcloud storage rsync --recursive "$local_path" "$remote")
    fi ;;
  *) echo "first argument must be pull or push" >&2; exit 2 ;;
esac

if [[ "${APPLY:-0}" == "1" ]]; then
  echo "+ ${cmd[*]}"; "${cmd[@]}"
else
  printf 'DRY-RUN:'; printf ' %q' "${cmd[@]}"; echo; echo "Re-run with APPLY=1 to execute."
fi
