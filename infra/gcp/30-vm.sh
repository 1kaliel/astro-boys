#!/usr/bin/env bash
# Create the pipeline VM. Billed while RUNNING (CPU/RAM) and always for its disk.
# Safety nets: hard stop after VM_MAX_RUN_DURATION, idle auto-shutdown (installed by vm/bootstrap.sh),
# SSH only through IAP, OS Login, no service-account keys.
source "$(dirname "$0")/lib.sh"
require GCP_PROJECT_ID GCP_ZONE VM_NAME VM_MACHINE_TYPE VM_DISK_GB VM_PROVISIONING \
        VM_MAX_RUN_DURATION VM_NETWORK_TAG PIPELINE_SA_NAME
PIPE_SA="$(pipeline_sa)"
confirm "create VM $VM_NAME ($VM_MACHINE_TYPE, ${VM_DISK_GB} GB, $VM_PROVISIONING) in $GCP_ZONE"

# SSH only from Google's IAP range (no SSH open to the internet).
run gcloud compute firewall-rules create astro-allow-iap-ssh --project="$GCP_PROJECT_ID" \
  --network=default --direction=INGRESS --action=allow --rules=tcp:22 \
  --source-ranges=35.235.240.0/20 --target-tags="$VM_NETWORK_TAG"

run gcloud compute instances create "$VM_NAME" \
  --project="$GCP_PROJECT_ID" \
  --zone="$GCP_ZONE" \
  --machine-type="$VM_MACHINE_TYPE" \
  --provisioning-model="$VM_PROVISIONING" \
  --max-run-duration="$VM_MAX_RUN_DURATION" \
  --instance-termination-action=STOP \
  --service-account="$PIPE_SA" \
  --scopes=cloud-platform \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size="${VM_DISK_GB}GB" --boot-disk-type=pd-balanced \
  --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \
  --metadata=enable-oslogin=TRUE \
  --tags="$VM_NETWORK_TAG" \
  --labels=team=astro-boys,purpose=space-apps-2026

echo "Next: ./infra/gcp/vm-control.sh ssh, then run infra/gcp/vm/bootstrap.sh on the VM."
