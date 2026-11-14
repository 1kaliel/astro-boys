# Astro Boys 🚀

Our team's project for the **NASA International Space Apps Challenge**.

> **Challenge:** [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)
> **Hackathon:** Sat Nov 14 09:00 → Sun Nov 15 23:59 (local event time), 2026

## The project

Fire records from different satellite sensors can't be compared naively. We:

1. **Harmonize** MODIS and VIIRS detections in space and time, keeping provenance, and validate them on the period both sensors cover.
2. **Explore** the history through a map, timeline and regional seasonality calendar.
3. **Flag** anomalies and critical periods by comparing each month with the historical median for the selected area.
4. **Download** the hotspots and analytics for any area and date range as CSV.

Full plan: [docs/project-plan.md](docs/project-plan.md).

> This prototype is exploratory. It is not an alert system and must not be used on its own for emergency or
> public-safety decisions.

## Repository layout

| Path | What's there |
|------|--------------|
| [docs/project-plan.md](docs/project-plan.md) | Goal, scope, architecture, guardrails, definition of done |
| [docs/blocks/](docs/blocks/) | The three work blocks with tasks and acceptance criteria |
| [docs/challenge/](docs/challenge/) | Challenge brief, official requirements, suggested tools |
| [docs/data-access.md](docs/data-access.md) | How we get FIRMS MODIS + VIIRS history fast |
| [docs/timeline.md](docs/timeline.md) | Event dates, schedule and checkpoints |
| [docs/tasks.md](docs/tasks.md) | Task board per team |
| [docs/team.md](docs/team.md) | Team Harmonization and Team Dashboard |
| [docs/risks.md](docs/risks.md) | Risks and contingency plans |
| [docs/methodology.md](docs/methodology.md) · [docs/data-dictionary.md](docs/data-dictionary.md) · [docs/model-card.md](docs/model-card.md) | Science docs |
| [docs/diary/](docs/diary/) · [docs/decisions/](docs/decisions/) | Timestamped diary and decision records |
| `data/` | Raw, interim and processed data (not committed). See [data/README.md](data/README.md) |
| `notebooks/` · `src/` · `scripts/` · `tests/` | Code |
| `artifacts/` · `presentation/` | Metrics, figures, screenshots, slides |

## How we work

- **Rules:** [AGENTS.md](AGENTS.md), for humans and AI coding agents.
- **Diary:** every decision, finished task and blocker is logged with a UTC timestamp via `./scripts/log.sh`.
- **Tools:** we use what the challenge suggests: [docs/challenge/suggested-tools.md](docs/challenge/suggested-tools.md).
- **Credits:** [docs/resources.md](docs/resources.md) · **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)

## Getting started

```bash
cp .env.example .env   # then fill in your keys (FIRMS MAP_KEY, etc.)
```

_Environment and run instructions go here once the tech stack is chosen._
