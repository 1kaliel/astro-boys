# Dashboard app (Team Dashboard)

**Owner:** Guilherme and Cleber (backend and deploy), Jean (floater). **Stack:** FastAPI backend + React (Vite, TypeScript)
single-page frontend, served from one container. Logged in the diary as `DECISION`.

Full spec: [docs/spec/dashboard.md](../docs/spec/dashboard.md). Design system: [docs/design-system.md](../docs/design-system.md).
Tasks and owners: [docs/tasks.md](../docs/tasks.md).

## What it shows

App bar, one filter row (area, years, time of day, scale) that scopes every view, a KPI row (latest month vs the
median, busiest month, year so far, months estimated from MODIS), the burning calendar (year × month heatmap) and the
map of 0.25° cells for the selected month.

## What it must do

- Select an area (draw a rectangle on a map, or enter lat/lon bounds) and a date range.
- Burning calendar: hotspot counts by year × month, early 2000s → present, color-blind-safe ramp, estimated months marked.
- Current month vs the historical median; trends; anomalies.
- Download the native hotspots in the area and dates as CSV, with provenance columns.
- Show source (NASA FIRMS), period, units and limitations on every view.

Language: **hotspots** and **fire activity** for counts. Never "fires" or "burned area" for detections.

## Status

- D1 skeleton: `/healthz`, the built frontend, Dockerfile on `$PORT`.
- D2 data access: `GET /api/calendar` reads `calendar/v1` from `ASTRO_DATA_ROOT`, sums the cells of an area and adds
  the historical median and anomalies of the sum (see [Calendar API](#calendar-api)).
- D3 map and area selection: `GET /api/cells` (see [Map API](#map-api)), rectangle drawing, visible map area, lat/lon
  bounds. The map is a separate chunk, loaded on demand (collapsed on phones).
- D4 burning calendar: year × month heatmap that reads the API.
- D8 (image): the calendar is baked into the image at build time, with its `model_version` (see [Container](#container-same-contract-as-cloud-run)).
- Dashboard layout: app bar, filter bar, KPI row (reads the same calendar answer as the heatmap), calendar and map.
- Not done: "this month vs median" card with date picker (D5), CSV (D6, reads `hotspots/v1` from the bucket).

## Calendar API

`GET /api/calendar?west=&south=&east=&north=&period=ALL|D|N[&baseline_start=&baseline_end=]`

Returns the monthly series of an area: `count_harmonized` summed over its cells, the origin of each month, the
historical median and the anomalies of the **sum**. Interactive docs: `/api/docs`.

Rules (docs/data-dictionary.md, and the diary `DECISION`s of D2):

- **Area:** the 0.25° cells that **overlap** the box. Cells that only touch its edge are out. A box smaller than a
  cell selects that cell. A box with no cell is a 422.
- **Sum first:** the median, the percent anomaly and the robust z-score are computed on the area sum, never averaged
  per cell. Median over the complete months of the baseline years (default: all years of the data), per month of the
  year. Fewer than 3 years: no median.
- **No data is not zero:** a month with no row anywhere in the extent is absent from the answer. A month with rows
  elsewhere counts as 0 detections for area cells without a row (an absent row means no detection by the source
  satellite; it does not prove there was no fire).
- **Pending intervals stay `null`:** if the pipeline has not delivered `ci_low` and `ci_high` for estimated months they
  are `null` ("pending"), never zero. Observed months have an interval equal to the count.
- **The interval of an area is approximate:** the variance of a sum of `n` cells is `Σ var × n^0.32`, because nearby
  cells have correlated errors (the data contract has the numbers). `interval_is_approximate` is true for more than one
  cell, and the UI says so.
- **Partial months** (`is_partial`, `days_observed`) are flagged and never compared with full months. The
  unfinished month is compared with the **same days of earlier years**: `median_hist` and the anomalies come from
  `month_to_date/v1` (days 1..N summed over the area per year, a year without a row counts as 0), with
  `median_days` = N and `median_n_years`. Any other partial month, or a server without that table, has no median.
- **No estimate is `null`:** `count_harmonized` is `null` (not 0, the UI says "No estimate") when a cell of the area,
  or the whole extent, has no estimate in the month, as in the estimated partial months of July and August 2002.

Data: `$ASTRO_DATA_ROOT/processed/calendar/$ASTRO_DATASET_VERSION` (defaults `data` and `v1`), loaded once at startup
(about 3 s, 290 MiB for 1.7 M rows). If it is missing the app still starts, `/healthz` answers and the calendar says 503.
`gs://` roots are not read for the calendar: in the image it is baked in at `/app/data` (D8).

```bash
# real data: pull the calendar from the bucket (read-only copy into data/, which git ignores)
GCS_BUCKET=<bucket> APPLY=1 ./scripts/sync_data.sh pull processed calendar/v1
ASTRO_DATA_ROOT=../data uv run uvicorn --app-dir backend astro_dashboard.main:app --port 8080     # from app/
```

## Map API

`GET /api/cells?year=&month=&period=ALL|D|N` returns `count_harmonized` per 0.25° cell for one month (the latest month
when `year` and `month` are omitted), the flags `estimated` and `partial`, and `breaks`: fixed class limits (quantiles of
every positive cell-month) so that months stay comparable on the map. The browser builds each cell's geometry from its
ID (`lib/grid.ts`). Which cells belong to an area uses the same overlap rule as the calendar API, so the map and the
calendar always talk about the same cells. `simulated: true` means the simulated table (`model_version` starting with
`MOCK`): the UI shows a banner, and those numbers must never appear in a figure, the demo or the submission. Responses
are gzip-compressed.

Frontend without a backend: `VITE_CALENDAR_SOURCE=fixture npm run dev` reads a small file of **synthetic** numbers
(rebuilt by `scripts/build_calendar_fixture.py`) and labels it "Simulated data".

## Layout

```text
app/
  pyproject.toml, uv.lock     backend Python project (uv; separate from the pipeline in src/)
  backend/astro_dashboard/    FastAPI app: main.py (routes, static files), api.py + calendar.py (calendar), cells.py (map)
  backend/tests/              pytest for the backend
  frontend/                   React + Vite + TypeScript SPA (npm; package-lock.json committed)
    src/styles/               design tokens (primitives, semantic, viz, components), calendar.css, layout.css
    src/components/ui/        Base UI primitives styled with the tokens
    src/components/viz/       KpiTile, Legend
    src/components/map/       MapPanel (lazy chunk), CellMap, MapTools
    src/features/calendar/    BurningCalendar (nivo heatmap), cells, table view, calendar model
    src/features/dashboard/   DashboardPage, AppBar, FilterBar, KpiRow, AboutDialog
    src/lib/ · data/ · state/ grid, metrics, format, theme · API clients · shared dashboard state
  Dockerfile, .dockerignore   one image: builds the frontend, runs uvicorn on $PORT
```

The container build context is this folder, so the app does not depend on the root `pyproject.toml`.

## Run locally

Needs [uv](https://docs.astral.sh/uv/), Node 24 and npm.

```bash
# Backend
cd app
uv sync
uv run uvicorn --app-dir backend astro_dashboard.main:app --port 8080

# Frontend (build once for the backend to serve it, or use the dev server)
cd app/frontend
npm ci
npm run build                 # output: app/frontend/dist, served by FastAPI at /
npm run dev                   # dev server on :5173, proxies /healthz and /api to :8080
```

Open http://localhost:8080 (built frontend) or http://localhost:5173 (dev server, backend on :8080).

Without the real calendar, make the simulated table (from the repo root, not real data):
`uv run astro-fire mock-calendar --bbox=-48.8,-18.4,-34.7,-1.0` writes `data/processed/calendar/mock/`; then start the
backend with `ASTRO_DATASET_VERSION=mock`.

**PowerShell (Windows):** `NAME=value command` is bash syntax and fails in PowerShell. Set the variables first; they
last only for that terminal:

```powershell
cd app
$env:ASTRO_DATA_ROOT = (Resolve-Path ..\data).Path
$env:ASTRO_DATASET_VERSION = "mock"      # or "v1" (the default) for the real calendar
uv run uvicorn --app-dir backend astro_dashboard.main:app --port 8080
```

## Test and check

```bash
cd app
uv run ruff check backend
uv run pytest

cd frontend
npm run typecheck
npm test
npm run build
```

Root `make ci` covers the pipeline (`src/`, `tests/`, `scripts/`) only. The app checks above are run by hand until they
are added to CI (open decision for the team).

## Container (same contract as Cloud Run)

Full runbook: [deploy/cloudrun/README.md](../deploy/cloudrun/README.md).

The calendar is **baked into the image** (D8). It comes in as a named build context from the git-ignored `data/`,
so it never enters git or the `app/` build context. With it goes `month_to_date/v1` (60 KB), the same days of
earlier years for the unfinished month; `hotspots/v1` stays in the bucket.

```bash
APPLY=1 ./scripts/sync_data.sh pull processed calendar/v1        # from the repo root
APPLY=1 ./scripts/sync_data.sh pull processed month_to_date/v1   # pull both at the same time
MODEL=$(cd app/backend && uv run --project .. python -m astro_dashboard.bake --print-model-version \
  ../../data/processed/calendar/v1)
docker build -t astro-dashboard --build-context calendar=data/processed/calendar/v1 \
  --build-context month_to_date=data/processed/month_to_date/v1 --build-arg MODEL_VERSION="$MODEL" app/
docker run --rm -p 8080:8080 -e PORT=8080 --memory 1g astro-dashboard
curl http://localhost:8080/healthz          # {"status":"ok"}
curl http://localhost:8080/api/version      # model_version loaded, model_version of the image, build record
```

The build loads the calendar the way the app does and **fails** if it is missing, if its `model_version` is not
`MODEL_VERSION`, or if `month_to_date` covers other days than the calendar's unfinished month (the two were pulled
at different times); without `month_to_date` it only warns, and the unfinished month has no median. It records what was baked in `/app/data/build-info.json` and in the label `astro.model_version`.
An image without data, for skeleton checks: `docker build --build-arg ALLOW_NO_CALENDAR=1 app/` (the calendar then
answers 503). Mounting other data over it still works (`-e ASTRO_DATA_ROOT=/data -v "$PWD/data:/data:ro"`); the
app logs a warning when its model differs from the image's.

The image runs as a non-root user, contains no `.env`, and listens on `0.0.0.0:$PORT`. Measured with the real
`calendar/v1` (23.6 MiB of Parquet): healthy in about 3 s, about 290 MiB of the 1 GiB limit, an area query in
about 70 ms.

## Deploy

Cloud Run deploy is `APPLY=1 ./deploy/cloudrun/deploy.sh`. Kali approves each deploy. Do not run it without him.
