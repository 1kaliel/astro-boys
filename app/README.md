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

Skeleton (task D1). The app serves `/healthz`, the built frontend, and an API status line. Map (D3) and calendar (D4)
come next. The data layer (D2) reads `calendar/v1` from `ASTRO_DATA_ROOT`, not wired yet.

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
```

The image runs as a non-root user, contains no `.env` or data files, and listens on `0.0.0.0:$PORT`. Data will be read
read-only from `ASTRO_DATA_ROOT` (mounted with `-v "$PWD/data:/data:ro"` for local runs) once D2 lands.

## Deploy

Cloud Run deploy is `APPLY=1 ./deploy/cloudrun/deploy.sh`. Kali approves each deploy. Do not run it without him.
