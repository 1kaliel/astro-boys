# Timeline

All times **UTC**. `H0` = hackathon start.

## Event dates

To fill in from the official event page (see [challenge/official-requirements.md](challenge/official-requirements.md)).

| When (UTC) | What |
|------------|------|
| TBD | Hackathon starts (H0) |
| TBD | Submission deadline |
| TBD | Judging / results |

## Before H0 (preparation)

| Task | Owner | Status |
|------|-------|--------|
| Confirm the official challenge and copy its brief | Person 1 | ⬜ |
| Request a FIRMS MAP_KEY (free) | Person 2 | ⬜ |
| Check how long a FIRMS archive download request takes to arrive | Person 2 | ⬜ |
| Shortlist 2–3 candidate pilot regions | Team | ⬜ |
| Check Meteomatics / Planetary Computer access terms | Person 6 | ⬜ |
| Agree on the tech stack (Python env, app framework) | Persons 4 + 6 | ⬜ |

> Check the official rules on what may be prepared before H0.

## 48-hour schedule

Workstreams run in parallel. Times are relative to H0.

| Window | Focus | Required output |
|--------|-------|-----------------|
| H0–H1 | Alignment and decisions | Region, period, scope, roles and open requirements logged |
| H1–H3 | Data collection and technical skeleton | MODIS/VIIRS samples, project structure, first empty map |
| H3–H6 | Harmonization | Dataset v0, first comparison, resolution decision |
| **H6** | **Checkpoint 1** | Block 1 meets minimum criteria, or scope is reduced |
| H6–H10 | Calendar + anomalies in parallel | Map with data, timeline, seasonal baseline |
| H10–H14 | Navigable prototype | Calendar, trend and filters integrated |
| **H14** | **Checkpoint 2** | Block 2 demo works without editing code |
| H14–H20 | PoC preparation | Target, baseline, features and temporal split defined |
| H20–H28 | Modelling and integration | First model evaluated; anomalies in the app |
| **H28** | **Checkpoint 3** | Keep, simplify or drop prediction from the main demo |
| H28–H38 | Scientific refinement | Baseline comparison, error analysis, model card |
| **H38** | **Feature freeze** | No new features except critical fixes |
| H38–H43 | Stabilization | Tests, performance, offline mode, sources, docs |
| H43–H46 | Story and presentation | Slides/script, video if required, timed rehearsal |
| H46–H47 | Submission review | Official checklist, links, permissions, credits |
| H47–H48 | Safety margin | Submit, save confirmation, back up all artifacts |

## Checkpoint rules

- **H6:** harmonization failing → shrink region/period. Never move on with data lacking provenance.
- **H14:** prototype not navigable → freeze new visualizations.
- **H28:** prediction only enters the main story if it beats or clearly adds to the baseline.
- **H38:** feature freeze. Reliability, docs and rehearsal only.

## Milestone tracker

| Milestone | Target | Status |
|-----------|--------|--------|
| First-hour decisions closed | H1 | ⬜ |
| Block 1 accepted | H6 | ⬜ |
| Block 2 demo navigable | H14 | ⬜ |
| Prediction go / no-go | H28 | ⬜ |
| Feature freeze | H38 | ⬜ |
| Two timed rehearsals | H46 | ⬜ |
| Submission confirmed | H48 | ⬜ |
