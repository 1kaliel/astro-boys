#!/usr/bin/env bash
# Day-to-day VM control. Usage: ./infra/gcp/vm-control.sh status|start|stop|ssh
# status and ssh run immediately; start and stop follow the APPLY=1 rule like every other script.
source "$(dirname "$0")/lib.sh"
require GCP_PROJECT_ID GCP_ZONE VM_NAME
cmd="${1:-status}"

case "$cmd" in
  status)
    gcloud compute instances describe "$VM_NAME" --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID" \
      --format='table(name,status,machineType.basename(),lastStartTimestamp,lastStopTimestamp)' ;;
  start)
    confirm "start $VM_NAME (billing for CPU/RAM begins)"
    run gcloud compute instances start "$VM_NAME" --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID" ;;
  stop)
    confirm "stop $VM_NAME (CPU/RAM billing stops; disk is kept and still billed)"
    run gcloud compute instances stop "$VM_NAME" --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID" ;;
  ssh)
    gcloud compute ssh "$VM_NAME" --zone="$GCP_ZONE" --project="$GCP_PROJECT_ID" --tunnel-through-iap ;;
  *)
    echo "usage: $0 status|start|stop|ssh" >&2; exit 2 ;;
esac
