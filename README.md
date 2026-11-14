# Astro Boys 🚀

Our team's project for the **NASA International Space Apps Challenge**.

> **Working theme:** harmonizing NASA FIRMS **MODIS** and **VIIRS** active-fire detections into a comparable
> history, exploring it through a map, timeline and regional fire calendar, and flagging critical periods.
> **Official challenge:** to be confirmed. See [docs/challenge/selection.md](docs/challenge/selection.md).

## The project

Fire records from different satellite sensors can't be compared naively. We:

1. **Harmonize** MODIS and VIIRS detections in space and time, keeping provenance, and validate them on the period both sensors cover.
2. **Explore** the history through a map, timeline and regional seasonality calendar.
3. **Flag** anomalous periods against a seasonal baseline, and test a proof of concept for estimating critical periods.

Full plan: [docs/project-plan.md](docs/project-plan.md).

> This prototype is exploratory. It is not an alert system and must not be used on its own for emergency or
> public-safety decisions.

## Repository layout

| Path | What's there |
|------|--------------|
| [docs/project-plan.md](docs/project-plan.md) | Goal, scope, architecture, guardrails, definition of done |
| [docs/blocks/](docs/blocks/) | The three work blocks with tasks and acceptance criteria |
| [docs/timeline.md](docs/timeline.md) | 48-hour schedule and checkpoints |
| [docs/tasks.md](docs/tasks.md) | Task board and first-hour decisions |
| [docs/team.md](docs/team.md) | Roles, backups, support pairs |
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
