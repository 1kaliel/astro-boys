# Team

Six people in two teams. Max team size for Space Apps is 6; everyone must be registered on the same Local Event.

> **Roles below are a proposal** (open decision Q10 in [project-plan.md](project-plan.md#open-decisions)).
> Confirm or swap at the lock-in. Tasks per person: [tasks.md](tasks.md).

## Team Harmonization

Turns raw FIRMS hotspots into the harmonized dataset. Spec: [spec/harmonization.md](spec/harmonization.md).

| Name | GitHub | Proposed role | Backup |
|------|--------|---------------|--------|
| Kali | [1kaliel](https://github.com/1kaliel) | Pipeline and cloud: ingest, aggregate, harmonize, export; data contract; scope owner | Justino |
| Justino | [Gabriel-S-Justino](https://github.com/Gabriel-S-Justino) | Data and QA: provenance, QA report, 2026 API pull, continuity check, credits, methodology text | Mateus |
| Mateus | [Mateus-Ed-Dev](https://github.com/Mateus-Ed-Dev) | Method and validation: factors, pooling, baselines, cross-validation, bootstrap, charts | Kali |

## Team Dashboard

Builds the web app. Spec: [spec/dashboard.md](spec/dashboard.md). The stack is this team's choice.

| Name | GitHub | Proposed role | Backup |
|------|--------|---------------|--------|
| Cleber | [Clbrfrancaa](https://github.com/Clbrfrancaa) | Data access / backend, CSV export, container, Cloud Run deploy | Guilherme |
| Guilherme | [Guilherme-Martins-Dev](https://github.com/Guilherme-Martins-Dev) | Map, area selection, shared state, AGGS drill-down (stretch) | Jean |
| Jean | [JeanGust4](https://github.com/JeanGust4) | Calendar heatmap, charts, anomaly view, accessibility, UI text | Cleber |

## Shared responsibilities

| Responsibility | Proposed owner |
|----------------|----------------|
| Final say on scope; submission page; AI-use statement | Kali |
| Data contract (one per team) | Kali + Cleber |
| Demo (30 s video or 7 slides) lead | To name at the lock-in |
| Official requirements check; second reviewer from the other team | Kali; reviewer to name |
| References and credits ([resources.md](resources.md)) | Justino |

## The hand-off between teams

The teams meet at the **data contract**: [data-dictionary.md](data-dictionary.md). Dashboard builds against a
mock with the same columns until `calendar/v1` exists (Checkpoint B).

## Working agreements

- Check-in at every checkpoint (Sat 23:00, Sun 02:00, Sun 11:00, Sun 15:00): done, blockers, next.
- Stuck for more than 30 minutes? Log a `BLOCKER` and tell the team.
- A task is done only when its deliverable exists, someone else can reproduce it, and it meets its acceptance criteria.
- Decisions are logged in the diary by whoever makes them. Scope cuts at checkpoints follow [timeline.md](timeline.md).
- Rest is planned (Sun 02:00–07:00). Long jobs run in `tmux` on the VM.
- Anything taken from outside the team (code, text, images, numbers) is listed in [resources.md](resources.md).
  We don't copy other teams' solutions.
