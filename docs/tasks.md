# Task board

Status: ⬜ not started · 🔄 in progress · ✅ done · ⛔ blocked / needs a decision

A task is done only when its deliverable exists, someone else can reproduce it, and it meets its acceptance criteria.

## Now (before the hackathon)

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Fill in the 6-person roster and assign roles (`docs/team.md`) | Lucas | ⬜ | |
| 2 | Confirm the official challenge matching the fire theme; copy its brief | Person 1 | ⬜ | `docs/challenge/` |
| 3 | List the challenge's suggested tools and data (`docs/challenge/suggested-tools.md`) | Person 1 | ⬜ | After #2 |
| 4 | Verify official requirements (`docs/challenge/official-requirements.md`) | Person 1 | ⬜ | Second person reviews |
| 5 | Fill in event dates (`docs/timeline.md`) | Person 1 | ⬜ | |
| 6 | Request a FIRMS MAP_KEY and test one API call | Person 2 | ⬜ | |
| 7 | Check FIRMS archive download turnaround and sensor date ranges | Person 2 | ⬜ | |
| 8 | Shortlist 2–3 pilot regions with enough fire activity | Team | ⬜ | |
| 9 | Propose tech stack (Python env, app framework, map library) | Persons 4 + 6 | ⬜ | Decide at H0–H1 |

## First-hour decisions (H0–H1)

Each one is logged as a `DECISION` in the diary when closed.

| Decision | Options | Owner | Status | Value |
|----------|---------|-------|--------|-------|
| Pilot region | | Team | ⬜ | |
| Historical period | Must include MODIS/VIIRS overlap | Team | ⬜ | |
| Main territorial unit | Biome, municipality, regular grid, other | Person 3 | ⬜ | |
| Grid cell size (if grid) | | Person 3 | ⬜ | |
| Main time unit | Day, week, month | Person 3 + 5 | ⬜ | |
| Main infrastructure (only one) | Local, Google Cloud, Azure | Person 6 | ⬜ | |
| Person with final say on scope | | Team | ⬜ | Default: Person 1 |
| Official submission and judging requirements | | Person 1 | ⬜ | |
| FIRMS access and credentials confirmed | | Person 2 | ⬜ | |
| Current terms of each Global Offer we'll use | | Person 1 | ⬜ | Before activating |

Pilot region criteria: enough fire activity, data available, narrative relevance, small enough to process within the hackathon.

## Workstream status

| Workstream | Owner | Status | Next milestone | Blocker |
|------------|-------|--------|----------------|---------|
| Coordination / submission | Person 1 | ⬜ | First-hour decisions (H1) | |
| FIRMS data | Person 2 | ⬜ | Raw samples (H3) | |
| Harmonization | Person 3 | ⬜ | Dataset v0 (H6) | |
| App / visualization | Person 4 | ⬜ | Empty map (H3) | |
| Anomalies / validation | Person 5 | ⬜ | Seasonal baseline (H10) | |
| Prediction / infrastructure | Person 6 | ⬜ | Target + baseline (H20) | |

Detailed per-block tasks: [blocks/01](blocks/01-harmonization.md) · [blocks/02](blocks/02-historical-calendar.md) · [blocks/03](blocks/03-anomalies-prediction.md)
