#!/usr/bin/env bash
# Run ON THE VM, as your own user, after `./infra/gcp/vm-control.sh ssh`:
#   curl -fsSL https://raw.githubusercontent.com/1kaliel/astro-boys/main/infra/gcp/vm/bootstrap.sh -o bootstrap.sh
#   less bootstrap.sh   # read it first
#   bash bootstrap.sh
#
# Idempotent: safe to re-run. Installs git + uv, clones the repo, creates the Python env,
# writes a cloud .env, runs the smoke test on local disk, and installs the idle auto-shutdown.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/1kaliel/astro-boys.git}"
REPO_DIR="${REPO_DIR:-$HOME/astro-boys}"
UV_VERSION="${UV_VERSION:-0.12.12}"          # same uv version the repo was set up with
IDLE_MINUTES="${IDLE_MINUTES:-30}"
MEM_LIMIT="${DUCKDB_MEMORY_LIMIT:-10GB}"     # ~60% of a 16 GB VM
GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GCS_BUCKET="${GCS_BUCKET:-}"
GCS_PREFIX="${GCS_PREFIX:-astro}"

echo "== System packages"
sudo apt-get update -qq
sudo apt-get install -y -qq git curl unzip tmux >/dev/null

echo "== uv $UV_VERSION"
if ! command -v uv >/dev/null || [[ "$(uv --version | awk '{print $2}')" != "$UV_VERSION" ]]; then
  curl -LsSf "https://astral.sh/uv/$UV_VERSION/install.sh" | sh
fi
export PATH="$HOME/.local/bin:$PATH"

echo "== Repository"
if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"

echo "== Python environment (locked)"
uv sync --frozen --extra gcs

if [[ ! -f .env ]]; then
  echo "== Writing .env for the cloud profile"
  sed -e "s|^ASTRO_PROFILE=.*|ASTRO_PROFILE=cloud|" \
      -e "s|^DUCKDB_MEMORY_LIMIT=.*|DUCKDB_MEMORY_LIMIT=$MEM_LIMIT|" \
      -e "s|^DUCKDB_TEMP_DIR=.*|DUCKDB_TEMP_DIR=$HOME/duckdb_tmp|" \
      .env.example > .env
  chmod 600 .env
fi

# Non-secret cloud identifiers can be supplied on the command line. FIRMS_MAP_KEY is intentionally
# untouched: the data-upload collaborator owns that separate step.
if [[ -n "$GCP_PROJECT_ID" ]]; then
  sed -i "s|^GCP_PROJECT_ID=.*|GCP_PROJECT_ID=$GCP_PROJECT_ID|" .env
fi
if [[ -n "$GCS_BUCKET" ]]; then
  sed -i \
    -e "s|^GCS_BUCKET=.*|GCS_BUCKET=$GCS_BUCKET|" \
    -e "s|^ASTRO_DATA_ROOT=.*|ASTRO_DATA_ROOT=gs://$GCS_BUCKET/$GCS_PREFIX|" \
    .env
fi

echo "== Smoke test (local disk on the VM)"
uv run astro-fire smoke

echo "== Idle auto-shutdown: power off after $IDLE_MINUTES min with no SSH session and no pipeline running"
sudo install -m 0755 infra/gcp/vm/idle-shutdown.sh /usr/local/bin/astro-idle-shutdown
sudo tee /etc/systemd/system/astro-idle-shutdown.service >/dev/null <<EOF
[Unit]
Description=Power off the Astro pipeline VM when idle
[Service]
Type=oneshot
Environment=IDLE_MINUTES=$IDLE_MINUTES
ExecStart=/usr/local/bin/astro-idle-shutdown
EOF
sudo tee /etc/systemd/system/astro-idle-shutdown.timer >/dev/null <<EOF
[Unit]
Description=Check every 5 minutes whether the Astro VM is idle
[Timer]
OnBootSec=10min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now astro-idle-shutdown.timer

echo
echo "Done. Long runs: start them inside tmux so they survive a dropped SSH connection."
echo "Data: ./scripts/sync_data.sh pull raw   (see docs/cloud/vm-runbook.md)"
