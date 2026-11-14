# Team

Six people. Roles are primary, not exclusive. Every workstream has a backup so nobody is a single point of failure.

| # | Role | Name | GitHub | Backup | Timezone |
|---|------|------|--------|--------|----------|
| 1 | Coordination, product and submission | | | Person 5 | |
| 2 | FIRMS data and provenance | | | Person 3 | |
| 3 | Geoprocessing and harmonization | | | Person 2 | |
| 4 | App and visualization | | | Person 6 | |
| 5 | Anomalies, statistics and validation | | | Person 1 | |
| 6 | Prediction, infrastructure and integration | | | Person 4 | |

Known so far: **Lucas** (GitHub `1kaliel`), role not yet assigned.

## Responsibilities

**1. Coordination, product and submission.** Owns scope, decisions, time and risks. Keeps the task board and
diary current. Confirms official requirements, licenses, credits and the submission form. Owns the story, script
and final delivery. Has the final say on scope.

**2. FIRMS data and provenance.** Downloads MODIS/VIIRS and preserves raw data. Maintains the data dictionary,
metadata, licenses and sources. Implements cleaning and quality checks.

**3. Geoprocessing and harmonization.** Defines the grid / aggregation and sensor comparison. Runs validation on
the overlap period. Produces the harmonized dataset and metrics.

**4. App and visualization.** Builds map, filters, timeline and calendar. Integrates analysis results. Prepares
the demo experience and offline mode.

**5. Anomalies, statistics and validation.** Builds the seasonal baseline and anomaly detection. Reviews metrics,
biases and scientific claims. Maintains the limitations report.

**6. Prediction, infrastructure and integration.** Integrates Meteomatics or another chosen source. Builds the
baseline, model and temporal evaluation. Handles running, publishing and basic monitoring.

## Support pairs

| Pair | Shared responsibility |
|------|----------------------|
| 2 + 3 | Data integrity and harmonization |
| 4 + 6 | App integration and publishing |
| 1 + 5 | Story, acceptance criteria and scientific rigor |

## Working agreements

- Each work session starts with a quick check-in: done, open decisions, blockers, next priorities.
- Stuck for more than 30 minutes? Log a `BLOCKER` and tell the team.
- A task is done only when its deliverable exists, someone else can reproduce it, and it meets its acceptance criteria.
- Decisions: Person 1 has the final say on scope; everything else by quick consensus, logged in the diary.
