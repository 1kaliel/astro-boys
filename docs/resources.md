# Resources and credits

Space Apps asks teams to credit every data source and tool. Add each one **the moment we use it**.
Before submitting, check each product's documentation for its required citation and terms.

## Data sources used

| Source | What we used | URL | License / citation | Added by |
|--------|--------------|-----|--------------------|----------|
| | | | | |

Planned: NASA FIRMS MODIS + VIIRS active fire (the challenge's listed resource). See [data-access.md](data-access.md).
At least one NASA data source is required for global judging.

## Tools and libraries used

| Tool | Purpose | License |
|------|---------|---------|
| [DuckDB](https://duckdb.org/) | Pipeline query engine (CSV → Parquet, out-of-core); dashboard backend (area sums over `calendar/v1`) | MIT |
| [Matplotlib](https://matplotlib.org/) | Static figures for the write-up and the demo (`uv sync --extra figures`) | Matplotlib license (BSD-style) |
| [uv](https://docs.astral.sh/uv/) | Python env and locked dependencies | Apache-2.0 / MIT |
| [Python](https://www.python.org/) 3.12 | Pipeline language | PSF |
| [gcsfs](https://github.com/fsspec/gcsfs) | Optional `gs://` access | BSD-3-Clause |
| [pytest](https://pytest.org/), [Ruff](https://docs.astral.sh/ruff/) | Tests, lint | MIT |
| [gitleaks](https://github.com/gitleaks/gitleaks) | CI secret scan | MIT |
| Google Cloud (Cloud Storage, Compute Engine, Cloud Run, Artifact Registry) | Shared data, pipeline VM, dashboard hosting | Commercial service |
| GitHub, GitHub Actions | Code hosting, CI | Commercial service |
| [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/) | Dashboard backend and server | MIT; BSD-3-Clause |
| [React](https://react.dev/), [Vite](https://vite.dev/), [TypeScript](https://www.typescriptlang.org/) | Dashboard frontend, build, types | MIT; MIT; Apache-2.0 |
| [Base UI](https://base-ui.com/) (`@base-ui/react`) | Unstyled accessible UI primitives (tooltip, select, tabs, dialog, number field), styled with our tokens | MIT |
| [nivo](https://nivo.rocks/) (`@nivo/heatmap` 0.99.0) | Year x month grid of the burning calendar; cells are drawn by our own component | MIT |
| [MapLibre GL JS](https://maplibre.org/) 6.18, [react-map-gl](https://visgl.github.io/react-map-gl/) 8.1 | Dashboard map (flat and globe projection), React bindings | BSD-3-Clause; MIT |
| [Terra Draw](https://github.com/JamesLMilner/terra-draw) + MapLibre adapter | Rectangle drawing for the area selection | MIT |
| [Vitest](https://vitest.dev/) | Frontend unit tests (calendar model, grid, metrics, scale) | MIT |
| [OpenFreeMap](https://openfreemap.org/) (styles Positron, Dark) | Basemap tiles, no key, provided as-is. Attribution "OpenFreeMap © OpenMapTiles, Data from OpenStreetMap" shown on the map | Free service ([terms](https://openfreemap.org/tos/)); OSM data under ODbL |

## References

| Reference | Used for |
|-----------|----------|
| NASA FIRMS, active fire data attributes (MODIS and VIIRS): https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs | Field meanings |
| NASA FIRMS FAQ: https://www.earthdata.nasa.gov/data/tools/firms/faq | NRT vs standard processing; confidence classes |
| FIRMS `AttributesReadme.txt` (inside every yearly zip) | Projection, citation and disclaimer guidance |
| Li, F., et al. (2018). Comparison of Fire Radiative Power Estimates From VIIRS and MODIS Observations. *JGR Atmospheres*. https://doi.org/10.1029/2017JD027823 | Near-simultaneous MODIS–VIIRS comparison (to read and confirm before citing in the submission) |
| NASA Earthdata notices on the MODIS → VIIRS transition and the end of S-NPP observations (links in [data-access.md](data-access.md#sensor-timeline)) | Sensor timeline |

## AI usage

**Required by the rules.** The submission must say how AI tools were used, and AI-generated code and data must be
acknowledged in descriptive text and metadata (images/video need a visible watermark). Record each use here as it
happens. See [challenge/official-requirements.md](challenge/official-requirements.md#ai-super-intelligence-rules).

| What | Tool | Notes |
|------|------|-------|
| Historical FIRMS ingestion and monthly aggregation implementation, regression fixture, and runbook | Codex | Assisted with pipeline code and verification. Historical detections come from NASA FIRMS. See [historical batch](historical-batch.md). |
| Burning calendar (task D4): `app/frontend/src/features/calendar/`, `src/data/calendarSource.ts`, `src/data/useCalendar.ts`, `src/styles/calendar.css`, unit tests, and the script that builds the fixture | Claude Code (Claude Sonnet 5.5, Anthropic) | Code written with AI assistance for Cleber, the task owner. The solution idea (a year x month heatmap of hotspot counts) comes from the challenge brief, not from AI. The fixture `app/frontend/src/data/fixtures/calendar-mock.json` is **synthetic** (from `astro-fire mock-calendar`), for building screens only |
| Historical dashboard calendar assembly, regression fixture, and verification | Codex | Implemented the H7 integration using the team's calibration functions, factors and coverage rules. |
| Calendar data access (task D2): `app/backend/astro_dashboard/{calendar,api}.py`, `app/backend/tests/test_calendar_api.py`, the API client in `app/frontend/src/data/`, and the app README section | Claude Code (Claude Sonnet 5.5, Anthropic) | Code written with AI assistance for Cleber, the task owner. The rules (sum cells first, absent rows, pending intervals) come from the data contract written by the Harmonization team. Checked against direct sums of the real `calendar/v1` |
| Dashboard design system, map and area selection (task D3), layout, filter bar and KPI row: `app/frontend/src/{styles,components,features/dashboard,lib}/`, `app/backend/astro_dashboard/cells.py`, their tests, and the integration of the burning calendar into the layout | Claude Code (Anthropic; Claude Opus 5.5 for the integration) | Code written with AI assistance for Guilherme, the task owner. The solution idea (map of cells, area selection, calendar) comes from the challenge brief and the dashboard spec, not from AI. Rules (sum cells first, absent rows, partial months never read as little activity) come from the data contract |
