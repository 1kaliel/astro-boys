# Budget and cost

## Budget alert checklist (Kali, before creating any paid resource)

- [x] Billing account linked to the project; promotional credit confirmed by the project owner. Exact credit
      expiry still needs to be copied from Billing before the post-event cleanup decision.
- [x] Project-scoped budget `astro-boys-credit-guardrail-2026` created.
- [x] Amount: **BRL 250 per month**, counting gross usage before credits (`EXCLUDE_ALL_CREDITS`). This warns
      early instead of waiting for promotional credit to be exhausted.
- [x] Alert thresholds: **50%, 80%, 90%, 100% of actual spend**, plus **100% of forecasted spend**.
- [x] Default IAM recipients enabled (billing admins and project users with the required billing role).
- [x] Decision and live resource state recorded in the diary.

A budget **alerts**; it does **not** stop spending. The hard limits come from the safety nets below.

Live state (2026-11-14): the processing VM is stopped, the Artifact Registry is empty, no Cloud Run service is
deployed, and the bucket holds 9.08 GiB of immutable FIRMS source archives. Bucket and stopped-VM disk storage
can still incur small charges.

## What costs money here

| Resource | Billed for | Safety net |
|----------|------------|------------|
| Pipeline VM | Every hour it's **running** (CPU/RAM); disk always, until deleted | Idle auto-shutdown (30 min), 12 h max run, stop when done |
| Cloud Storage | GB stored per month; operations; **egress** to the internet | Interim auto-delete (14 days); pull only what you need |
| Cloud Run | Request time and instances | Scale to zero, max 3 instances |
| Artifact Registry | GB of images stored | Delete old images after the event |
| Cloud Build (if used) | Build minutes | Builds run locally with Docker by default |

**Egress:** downloading from the bucket to laptops is internet egress, billed per GB. Six people each pulling the
full raw set adds up; pull a pilot area or use the VM. Same-region VM ↔ bucket traffic is free.

## Cheapest effective plan

1. Do heavy processing **once** on the VM, then stop it.
2. Keep the dashboard on **pre-aggregated** Parquet (small, fast, cheap to serve).
3. After judging: delete the VM, the Artifact Registry images and `interim/`; keep `raw/` and `processed/`
   only if needed, or delete the project.
