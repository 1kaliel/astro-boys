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
- D11 L3 drill-down on the map: click a cell for the native detections of its 16 sub-cells (see [Map API](#map-api)).
- D4 burning calendar: year × month heatmap that reads the API.
- D8 (image): the calendar is baked into the image at build time, with its `model_version` (see [Container](#container-same-contract-as-cloud-run)).
- Dashboard layout: app bar, filter bar, KPI row (reads the same calendar answer as the heatmap), calendar and map.
- D6 CSV download: `GET /api/hotspots.csv` streams the native hotspots of the same cells and years, read from the
  bucket on Cloud Run (see [Hotspots CSV API](#hotspots-csv-api)); "CSV" in the filter bar.
- D9 should-haves: "Raw by sensor" and "Anomaly" views of the calendar, the trend chart (harmonized next to the raw
  counts of Aqua MODIS and S-NPP VIIRS) and the seasonal profile (p10 to p90 band, median, one year with the 90%
  interval of its estimated months). The charts are plain SVG (`features/charts/`), no chart library added.
- D11 drill-down (backend): `GET /api/drilldown` splits one L2 cell into its 16 L3 cells of native detections for
  one month, with the 3 × 3 block of L2 cells around it (see [Drill-down API](#drill-down-api)).
- Not done: "this month vs median" card with date picker (D5).

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
- **Raw counts stay per satellite:** `raw_aqua`, `raw_terra`, `raw_snpp`, `raw_n20` are each summed over the area and
  never added together (MODIS and VIIRS are different instruments); `null` means the satellite had no data in that
  month. `raw_source` is the native count of the month's `source_satellite`: what a chart of raw counts shows.
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

## Hotspots CSV API

`GET /api/hotspots/count?west=&south=&east=&north=&start=YYYY-MM-DD&end=YYYY-MM-DD[&period=ALL|D|N][&include_all=true]`
gives `{rows, max_rows, cells, ...}`; `GET /api/hotspots.csv` with the same query streams the file
(`astro-hotspots_<box>_<start>_<end>.csv`).

- **Same cells as the calendar** (the 0.25° cells that overlap the box), and `start`/`end` are local solar dates
  (`date_local`), so a CSV adds up to the raw counts behind the calendar. Checked on the real data: 16 cells
  (-41, -10, -40, -9) in 2013 give 1,723 rows, the `raw_snpp` sum of the calendar.
- **Main filter by default** (`passes_main_filter`: type 0, nominal or high confidence), the rows the calendar
  counts; `include_all=true` returns every detection.
- Columns: `hotspot_id, acq_ts_utc, date_local, latitude, longitude, satellite, instrument, version, daynight,
  confidence_raw, confidence_class, type, passes_main_filter, frp_mw, brightness_mir_k, brightness_tir_k, scan_km,
  track_km, cell_l2, cell_l3, country, source_file`, ordered by time. Values as delivered by NASA FIRMS for each
  sensor; never compare brightness or confidence across sensors.
- Limits: at most `ASTRO_CSV_MAX_ROWS` rows (default 500,000; more is a 413 with "narrow the area or the years"),
  one export at a time per instance (429 otherwise). Bad box or dates: 422; source unreadable: 503. A local source that
  has none of the requested years (an offline copy with a few years) is a 503 that names them, never 0 rows.

Source: `$ASTRO_HOTSPOTS_ROOT`, default `$ASTRO_DATA_ROOT/processed/hotspots/v1`. On Cloud Run it is
`gs://<bucket>/astro/processed/hotspots/v1`, read with the service account (Application Default Credentials, gcsfs;
no key files). Only the partitions of the requested years are read: one year is about 60 to 90 MB (MODIS + VIIRS).
Locally, pull the years you need or read the bucket after `gcloud auth application-default login`:

```bash
APPLY=1 ./scripts/sync_data.sh pull processed hotspots/v1/instrument=VIIRS/year=2013   # one partition, ~23 MB
```

## Drill-down API

`GET /api/drilldown?cell=<L2 id>&year=YYYY&month=M[&period=ALL|D|N]` (D11, AGGS drill-down)

```json
{"cell": "G083135.16", "year": 2013, "month": 9, "period": "ALL", "satellite": "SNPP", "instrument": "VIIRS",
 "min_detections": 5, "subdivided": true, "total": 639,
 "neighbors": [{"id": "G083135.11", "count": 245}, "... 9 cells"],
 "l3": [{"id": "G083135.16.01", "count": 59}, "... cells with at least one detection"]}
```

- **Native detections only**, never harmonized values: L3 (0.0625°) exists for drill-down, the harmonized counts stop
  at L2. Same rows as the calendar's raw counts: local solar month (`date_local`), `passes_main_filter`, optional
  day or night.
- **One satellite:** the month's `source_satellite` from the calendar, the one `raw_source` counts (Aqua MODIS
  before the VIIRS era, S-NPP VIIRS after, NOAA-20 in the months the calendar takes from it). Satellites are never
  added together, so a MODIS month and a VIIRS month are not comparable.
- **Neighbors:** the 3 × 3 block of L2 cells centred on `cell` (the cell included), rows from the south and columns
  from the west, with native counts (0 allowed). The block crosses 1° boundaries; rows beyond a pole are left out.
- **Stop rules:** L3 is the deepest level (an L3 id is a 422), and a cell with fewer than `min_detections` (5)
  detections is not subdivided: `subdivided: false`, `l3: []`. `l3` lists the target's L3 cells with a count > 0,
  sorted by id; their counts add up to `total`.
- Errors: not an L2 id, bad year, month or period, or a month the calendar does not have: 422. hotspots/v1 or the
  partition of that instrument and year missing or unreadable: 503 (missing is never zero).
- Reads one partition (`instrument=…/year=…`) of `$ASTRO_HOTSPOTS_ROOT`, local or `gs://`, like the CSV.
  Checked on the local 2013 VIIRS partition: G083135.16 in September 2013 gives 639 detections, equal to
  `/api/hotspots/count` for that cell and month and to the calendar's `raw_snpp`, the 16 L3 counts add up to it;
  about 0.1 s per request.

## Map API

`GET /api/cells?year=&month=&period=ALL|D|N` returns `count_harmonized` per 0.25° cell for one month (the latest month
when `year` and `month` are omitted), the flags `estimated` and `partial`, and `breaks`: fixed class limits (quantiles of
every positive cell-month) so that months stay comparable on the map. The browser builds each cell's geometry from its
ID (`lib/grid.ts`). Which cells belong to an area uses the same overlap rule as the calendar API, so the map and the
calendar always talk about the same cells. `simulated: true` means the simulated table (`model_version` starting with
`MOCK`): the UI shows a banner, and those numbers must never appear in a figure, the demo or the submission. Responses
are gzip-compressed.

**L3 drill-down (D11).** A click on a cell of the map calls `GET /api/drilldown?cell=<L2 id>&year=&month=&period=`
and shows the cell's 16 sub-cells (0.0625°, about 7 km) with the **native** detections of the month's source satellite,
plus the 8 neighboring 0.25° cells (outlined, with their native count) for context. The harmonized layer is hidden
meanwhile: estimates exist only at 0.25°. A cell with fewer than 5 detections is not subdivided (stop rule); L3 is the
deepest level. "Back to L2 cells" or Escape returns. Geometry from the IDs alone (`l3Bounds`, `l3Children`,
`neighborsOf` in `lib/grid.ts`).

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
