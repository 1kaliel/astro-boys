# FIREWATCHER

A burning-activity calendar of harmonized MODIS and VIIRS hotspots, by team **Astro Boys**, for the
**NASA International Space Apps Challenge 2026**.

**Live app:** https://astro-dashboard-301238386836.us-central1.run.app · **Methodology:**
[docs/methodology.md](docs/methodology.md) · **Credits and AI use:** [docs/resources.md](docs/resources.md)

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
| [docs/spec/](docs/spec/) | Specs: [harmonization method](docs/spec/harmonization.md), [dashboard](docs/spec/dashboard.md) |
| [docs/data-dictionary.md](docs/data-dictionary.md) · [docs/methodology.md](docs/methodology.md) | Data contract; methods and results |
| [docs/data-access.md](docs/data-access.md) · [docs/historical-batch.md](docs/historical-batch.md) | How we get FIRMS MODIS + VIIRS history; how to rebuild the monthly counts |
| [docs/storage-layout.md](docs/storage-layout.md) | Data layers and paths, the same on a laptop, the VM and Cloud Storage |
| [docs/diary/](docs/diary/) · [docs/decisions/](docs/decisions/) | Timestamped diary and decision records |
| `data/` | Raw, interim and processed data (not committed). See [data/README.md](data/README.md) |
| `src/astro_fire/` · `tests/` · `scripts/` | Pipeline code (Python + DuckDB), tests, helpers |
| `infra/gcp/` · [`deploy/cloudrun/`](deploy/cloudrun/README.md) · `deploy/local/` | Google Cloud setup scripts, Cloud Run deploy, offline local run |
| [`app/`](app/README.md) | Dashboard (Team Dashboard's stack) |
| `artifacts/` | Metrics, figures, screenshots |

## How we worked

- **Diary:** every decision, finished task and blocker is logged with a UTC timestamp in [docs/diary/](docs/diary/).
- **Credits and AI use:** data sources, references, tools and every use of AI are listed in
  [docs/resources.md](docs/resources.md).

## Getting started

Requires [uv](https://docs.astral.sh/uv/) (it installs the right Python by itself).

```bash
cp .env.example .env     # local defaults work as-is; add FIRMS_MAP_KEY when you have one
make setup               # uv sync: locked Python 3.12 env with DuckDB
make smoke               # sample FIRMS rows -> DuckDB -> partitioned Parquet -> manifest
make ci                  # lint, tests, repo hygiene, smoke (same as GitHub CI)
```

Runs locally by default (`data/`). In the cloud, the same commands run on the pipeline VM against the shared
bucket (layout: [docs/storage-layout.md](docs/storage-layout.md)). The dashboard lives in [`app/`](app/README.md) and deploys to
Cloud Run via [`deploy/cloudrun/`](deploy/cloudrun/README.md).
