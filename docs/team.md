# Team

Six people in two teams. Max team size for Space Apps is 6; everyone must be registered on the same Local Event.

## Team Harmonization (Part 1 of the challenge)

Turns raw FIRMS MODIS + VIIRS hotspots into one harmonized, documented dataset and the analytics the app needs.
Detail: [blocks/01-harmonization.md](blocks/01-harmonization.md).

| Name | GitHub | Focus |
|------|--------|-------|
| Kali | [1kaliel](https://github.com/1kaliel) | |
| Justino | [Gabriel-S-Justino](https://github.com/Gabriel-S-Justino) | |
| Mateus | [Mateus-Ed-Dev](https://github.com/Mateus-Ed-Dev) | |

## Team Dashboard (Part 2 of the challenge)

Builds the web app: area and date selection, burning calendar, trends, anomalies, CSV and chart downloads.
Detail: [blocks/02-historical-calendar.md](blocks/02-historical-calendar.md).

| Name | GitHub | Focus |
|------|--------|-------|
| Cleber | [Clbrfrancaa](https://github.com/Clbrfrancaa) | |
| Guilherme | [Guilherme-Martins-Dev](https://github.com/Guilherme-Martins-Dev) | |
| Jean | [JeanGust4](https://github.com/JeanGust4) | |

Each team plans its own work in detail. Fill in the Focus column when roles are set.

## Shared responsibilities (assign a name)

| Responsibility | Owner |
|----------------|-------|
| Final say on scope; submission page | |
| Official requirements check (second reviewer: another team) | |
| Demo (30 s video or 7 slides) lead | |
| Data contract between teams (schema of the harmonized dataset) | One from each team |
| Credits and AI-use record ([resources.md](resources.md)) | |

## The hand-off between teams

The two teams meet at the **data contract**: the schema of the harmonized dataset and the aggregates the app
reads. Agree on it early, write it in [data-dictionary.md](data-dictionary.md), and let Dashboard build against
a small sample file until the real data is ready.

## Working agreements

- Each work session starts with a quick check-in: done, open decisions, blockers, next priorities.
- Stuck for more than 30 minutes? Log a `BLOCKER` and tell the team.
- A task is done only when its deliverable exists, someone else can reproduce it, and it meets its acceptance criteria.
- Decisions are logged in the diary by whoever makes them.
