# Dashboard app (Team Dashboard)

**Owner:** Guilherme and Cleber (backend and deploy), Jean (floater). **Stack:** FastAPI backend + React (Vite, TypeScript)
single-page frontend, served from one container. Logged in the diary as `DECISION`.

Full spec: [docs/spec/dashboard.md](../docs/spec/dashboard.md). Tasks and owners: [docs/tasks.md](../docs/tasks.md).

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
- D4 burning calendar: year × month heatmap that reads the API.
- Not done: map and area selection (D3), "this month vs median" card (D5), CSV (D6), reading `gs://` directly (D8).

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
- **Pending intervals stay `null`:** `ci_low` and `ci_high` of estimated months are `null` until the pipeline delivers
  them (H11). Observed months have an interval equal to the count. The interval of a sum uses the summed variance.
- **Partial months** (`is_partial`, `days_observed`) are flagged and get no anomaly.

Data: `$ASTRO_DATA_ROOT/processed/calendar/$ASTRO_DATASET_VERSION` (defaults `data` and `v1`), loaded once at startup
(about 3 s, 290 MiB for 1.7 M rows). If it is missing the app still starts, `/healthz` answers and the calendar says 503.
`gs://` roots are not read yet (task D8).

```bash
# real data: pull the calendar from the bucket (read-only copy into data/, which git ignores)
GCS_BUCKET=<bucket> APPLY=1 ./scripts/sync_data.sh pull processed calendar/v1
ASTRO_DATA_ROOT=../data uv run uvicorn --app-dir backend astro_dashboard.main:app --port 8080     # from app/
```

Frontend without a backend: `VITE_CALENDAR_SOURCE=fixture npm run dev` reads a small file of **synthetic** numbers
(rebuilt by `scripts/build_calendar_fixture.py`) and labels it "Simulated data".

## Layout

```text
app/
  pyproject.toml, uv.lock     backend Python project (uv; separate from the pipeline in src/)
  backend/astro_dashboard/    FastAPI app: main.py serves the API and the built frontend
  backend/tests/              pytest for the backend
  frontend/                   React + Vite + TypeScript SPA (npm; package-lock.json committed)
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

```bash
docker build -t astro-dashboard app/
docker run --rm -p 8080:8080 -e PORT=8080 --memory 1g astro-dashboard
curl http://localhost:8080/healthz          # {"status":"ok"}

# with the real calendar (data stays outside the image, mounted read-only)
docker run --rm -p 8080:8080 -e PORT=8080 --memory 1g -e ASTRO_DATA_ROOT=/data -v "$PWD/data:/data:ro" astro-dashboard
```

The image runs as a non-root user, contains no `.env` or data files, and listens on `0.0.0.0:$PORT`. Data is read
read-only from `ASTRO_DATA_ROOT`. Measured with the real `calendar/v1` (23.6 MiB of Parquet): healthy in about 3 s,
about 290 MiB of the 1 GiB limit, an area query in about 70 ms. Without data the app is healthy and the calendar
answers 503. How the data reaches Cloud Run (bucket read or baked into the image) is decided in D8.

## Deploy

Cloud Run deploy is `APPLY=1 ./deploy/cloudrun/deploy.sh`. Kali approves each deploy. Do not run it without him.
