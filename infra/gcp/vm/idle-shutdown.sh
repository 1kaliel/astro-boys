#!/usr/bin/env bash
# Power off the VM after IDLE_MINUTES with no logged-in user and no pipeline process.
# Installed by bootstrap.sh as a systemd timer. Powering off from inside = instance STOPPED
# (no CPU/RAM billing; the disk is kept). Disable: sudo systemctl disable --now astro-idle-shutdown.timer
set -euo pipefail
IDLE_MINUTES="${IDLE_MINUTES:-30}"
STATE=/var/tmp/astro-idle-since
BUSY_PATTERN='astro-fire|firms_download|duckdb|gcloud storage|pytest'

if [[ -n "$(who)" ]] || pgrep -f "$BUSY_PATTERN" >/dev/null; then
  rm -f "$STATE"
  exit 0
fi

now=$(date +%s)
if [[ ! -f "$STATE" ]]; then
  echo "$now" > "$STATE"
  exit 0
fi

since=$(cat "$STATE")
if (( now - since >= IDLE_MINUTES * 60 )); then
  logger -t astro-idle-shutdown "idle for ${IDLE_MINUTES} min, powering off"
  rm -f "$STATE"
  systemctl poweroff
fi
