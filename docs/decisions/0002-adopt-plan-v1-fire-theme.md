# 0002: Adopt plan v1 (FIRMS fire harmonization) as the working plan

- **Date:** 2026-11-14 13:36 UTC
- **Status:** accepted (working plan; official challenge still to be confirmed)
- **Deciders:** Lucas

## Context

The team needs a concrete direction before the hackathon so preparation (data access, roles, stack) can start.
Lucas drafted plan v1 for a 6-person team over 48 hours.

## Decision

Adopt plan v1 as the working plan:

- **Theme:** harmonize NASA FIRMS MODIS and VIIRS active-fire detections, build a historical fire calendar, and
  identify critical periods.
- **Three blocks:** harmonization (6 h), historical calendar (8 h), anomalies and prediction PoC (24 h), with
  go/no-go checkpoints at H6, H14, H28 and a feature freeze at H38.
- **Six roles** with backups and support pairs.
- **NASA FIRMS** is the primary data source; Global Offers are optional, never hard dependencies.

Structured in [../project-plan.md](../project-plan.md); original in [../plan/plan-v1-original-pt.md](../plan/plan-v1-original-pt.md).

## Options considered

1. **Wait for the official challenge before planning**: no wasted work, but loses preparation time.
2. **Adopt plan v1 now, verify against the official challenge later**: preparation starts now; risk of
   adjustment if the brief differs. **Chosen.**

## Consequences

- The official challenge must be confirmed and the plan checked against its brief; changes get logged as decisions.
- The challenge's own suggested resources take priority over plan v1's list (rule in AGENTS.md).
- Region, period, units and infrastructure remain open and are closed in the first hour.
