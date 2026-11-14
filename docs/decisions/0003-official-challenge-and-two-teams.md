# 0003: Official challenge confirmed; work split into two teams

- **Date:** 2026-11-14 13:51 UTC
- **Status:** accepted
- **Deciders:** Kali for the team

## Context

Plan v1 ([ADR 0002](0002-adopt-plan-v1-fire-theme.md)) assumed a fire-harmonization theme and six individual roles.
The hackathon started Sat Nov 14, 2026, and the official challenge and its rules are now known.

## Decision

1. **Challenge:** [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/).
   It matches plan v1 Blocks 1 and 2. Summary: [../challenge/brief.md](../challenge/brief.md).
2. **Two teams of three**, mirroring the two parts the brief suggests:
   - **Harmonization:** Kali, Justino, Mateus. FIRMS data → harmonized dataset and analytics.
   - **Dashboard:** Cleber, Guilherme, Jean. The web app.
   Each team plans its own work in detail. The teams meet at the data contract ([../data-dictionary.md](../data-dictionary.md)).
3. **Primary data:** NASA FIRMS, the only resource the challenge lists, via the fast path in [../data-access.md](../data-access.md).

## Facts that shape the plan

- Deadline: **Sun Nov 15, 23:59 local event time**, about 39 hours from the start, not the 48 hours plan v1 assumed.
  Schedule compressed in [../timeline.md](../timeline.md).
- Submission and linked materials must be in English; AI use must be acknowledged; demo ≤ 30 s or ≤ 7 slides.
  See [../challenge/official-requirements.md](../challenge/official-requirements.md).

## Consequences

- Plan v1's six-role structure is replaced by the two teams.
- Weather data and the prediction PoC aren't asked for by the brief; they are treated as stretch goals pending team confirmation.
