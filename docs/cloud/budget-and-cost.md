# Budget and cost

## Budget alert checklist (Kali, before creating any paid resource)

- [ ] Billing account linked to the project. Check if free-trial credits apply (Global Offers / new-customer
      trial) and note the expiry.
- [ ] Budget created in **Billing → Budgets & alerts**, scoped to this project only.
- [ ] Amount set to what the team is willing to spend (decision for Kali; log it in the diary).
- [ ] Alert thresholds: **50%, 90%, 100% of actual spend**, plus **100% of forecasted spend**.
- [ ] Alert emails go to billing admins and users; add Kali's email and one teammate.
- [ ] Note in the diary: budget amount, thresholds, recipients.

A budget **alerts**; it does **not** stop spending. The hard limits come from the safety nets below.

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
