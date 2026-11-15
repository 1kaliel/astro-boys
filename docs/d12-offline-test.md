# D12: offline fallback tested on a local container

Run on 2026-11-15, 11:20 to 11:40 UTC, by Guilherme with an AI assistant (Claude), on Windows 10 with Docker
Desktop (Docker 29) and Git Bash. Branch `docs/d12-offline-test`, from `main` at `5c98e6c`. Spec acceptance
([dashboard spec](spec/dashboard.md) §7): "the same container runs locally from `data/`". It does: the image built
from the same Dockerfile as Cloud Run, with the same data bundle as the live revision, serves the whole dashboard
with no network beyond localhost. What is missing offline is listed below.

## Data and image

| What | Value |
|---|---|
| `calendar/v1` | 25 year partitions, 73,065,028 bytes, re-synced from the bucket at about 11:24 UTC: the bundle of the live revision `astro-dashboard-00006-bll` |
| `month_to_date/v1` | `part-0.parquet`, 53,651 bytes, 36,079 rows, pulled at about 11:24 UTC |
| `hotspots/v1` (local sample) | `instrument=VIIRS/year=2013` only, mounted read-only |
| Model | `fb-l1-terra-rec-4` (read from the calendar Parquet, as `deploy.sh` does) |
| Image | `astro-dashboard:offline-local`, 239 MB; build record: 1,838,338 rows, 2002 to 2026, `month_to_date` window November, 14 days, 13 years |

The data folders were read in the main checkout and not changed.

## How to run it

One command, from the repository root, after pulling the data with `scripts/sync_data.sh`
([Cloud Run runbook](../deploy/cloudrun/README.md#run-the-container-locally-first)):

```bash
./deploy/local/run-offline.sh                 # builds astro-dashboard:offline-local if missing, serves :8080
BUILD=1 ./deploy/local/run-offline.sh         # rebuild first (new data or app change)
DATA_DIR=/path/to/data ./deploy/local/run-offline.sh   # data elsewhere (this test used the main checkout's data/)
```

[`deploy/local/run-offline.sh`](../deploy/local/run-offline.sh) builds with the `calendar` and `month_to_date` build
contexts and `MODEL_VERSION` from the calendar, then runs `docker run --rm -p 8080:8080 -e PORT=8080 --memory 1g`,
with `data/processed/hotspots/v1` mounted read-only at `/data/hotspots` and `ASTRO_HOTSPOTS_ROOT=/data/hotspots`. It
passes no credentials and no `.env`. In Git Bash it turns MSYS path conversion off and hands Docker Windows paths
(`pwd -W`); on Linux and macOS it uses plain paths.

## How it was tested

1. **Browser with the external network cut.** Headless Chromium (Playwright 1, installed in a temporary folder outside
   the repository, not a project dependency). Every request whose host is not `localhost` or `127.0.0.1` was aborted
   as "internet disconnected". Fresh contexts, no cache. Viewports 1280 × 720 and 390 × 844.
2. **Container with no network at all.** `docker run --network none` with the same image and the hotspots mounted,
   checked from inside the container (`docker exec ... python`), because Docker Desktop publishes no port for a
   container on `--network none` (the port map came back empty). From inside, an outside name does not resolve.

Run once on the image built from `main` (before) and once with the fixes of this branch (after).

## Results

| Check | Result |
|---|---|
| `/api/healthz` | 200, `{"status":"ok"}` |
| `/api/version` | `fb-l1-terra-rec-4` loaded and in the image; `month_to_date` 36,079 rows, November, 14 days, 13 years |
| Page load, console | Loads; the only console errors are the blocked basemap style request and, in the "after" run, the 503 of the 2015 CSV count below (both expected). No page errors |
| Burning calendar | 300 cells, 293 with data, 2002 to 2026 |
| KPIs | November 2026 so far 20.4K, 11% below the median of the same 14 days (22.8K, 13 earlier years); busiest month October; 2026 so far 222.6K; 115 of 293 months estimated from MODIS. Same values as the public screenshots of PR 53 |
| Unfinished-month median | Works offline: `/api/calendar` for the pilot gives November 2026 = 20,380, `median_hist` 22,785 over 14 days and 13 years |
| Trend chart, seasonal profile | Drawn, same shapes as on the public page |
| "How to read" dialog | Opens with its title in view, five sections, closes with Escape |
| Map | "Basemap unavailable: showing the cells only." after the style timeout (5 s); the cells, the area outline and the legend are drawn on a plain background |
| CSV, 16 cells (-41, -10, -40, -9), 2013 | Popover: "1,723 hotspots in 16 cells"; `/api/hotspots/count` 1,723; the downloaded file has 1,723 rows and 22 columns |
| CSV, same area, 2015 (not in the local sample) | Before: count 0, "No detections in these cells and years", and the CSV endpoint returned 200 with only the header: missing data shown as zero. After (this branch): 503 "The native hotspots of 2015 are not on this server (it has: 2013)." in the popover, no download link |
| `--network none` | healthz, version, the page, `/api/calendar`, `/api/cells` (2,156 cells), the 2013 count and CSV (1,723 rows) and the 2015 error all answer as above |
| Memory | About 300 MiB of the 1 GiB limit after the run |
| Favicon | Before: `/favicon.ico` 404. After: `/favicon.svg` 200 `image/svg+xml`, linked from the page; `/favicon.ico` redirects to it (301) |
| App bar at 390 px | Badge, "How to read" and the theme button inside the screen (right edge 378 of 390) before and after; see the fix below |

## Unavailable offline, by design

- **Basemap tiles** (OpenFreeMap). The map shows the cells only, with the note above. The credit line under the map
  still reads "basemap © OpenStreetMap contributors" although no basemap is drawn.
- **CSV and native hotspots outside the local copy.** Only the years pulled into `data/processed/hotspots/v1` answer.
  A request for years that are all missing is now a clear 503. A range that includes at least one local year is
  counted from the years present only (for example 2013 to 2015 gives the 2013 rows): the error is not raised for a
  partly covered range. Pull every year of the demo before going offline
  (`APPLY=1 ./scripts/sync_data.sh pull processed hotspots/v1/instrument=VIIRS/year=<year>`).
- **Anything read from the bucket** (`gs://`): the offline run passes no credentials, so `ASTRO_HOTSPOTS_ROOT` must be
  a local folder.

## Fixes in this branch

- **CSV of years that are not in a local copy** (`app/backend/astro_dashboard/hotspots.py`, `api.py`): a local
  hotspots root that has none of the requested years now answers 503 naming the years, instead of 0 rows. The bucket
  (`gs://`) is not listed, so Cloud Run behaves as before. Tests: `test_years_missing_from_a_local_copy_are_a_503_not_zero`;
  the header-only test now asks for months of 2013 without detections.
- **Favicon**: `app/frontend/public/favicon.svg`, the app-bar logo (rounded square, magma 300 to 600, the design
  tokens), linked from `index.html`; `/favicon.ico` redirects to it, so the 404 in the revision log goes away. Replaces
  the inline blue square (a data URI) that the D10 check did not see.
- **Model badge in the app bar**: the cut seen in the D10 check could not be reproduced at 390 px here (light and dark,
  with and without a scrollbar, mobile emulation, root font 20 px), nor in PR 53's phone captures. The CSS now lets the
  badge shorten with an ellipsis (full text in its tooltip) instead of passing the right edge; checked by forcing it:
  root font 24 px at 260 px wide gives "Model fb-l1…" inside the screen. At 390 and 1280 px nothing changes.

Checks: `uv run ruff check`, `uv run pytest` (71 passed) in `app/`; `npm ci`, `npm run typecheck`, `npm test` (87
passed), `npm run build` in `app/frontend/`; both browser runs above on images built from this branch's tree.

## Not tested

- A physical phone, a screen reader, Firefox or Safari, a second machine (Linux or macOS) for `run-offline.sh`.
- A browser on a machine that is really disconnected: the cut was simulated by aborting requests in the browser, and
  the container with `--network none` was checked from inside, not from a browser.
- Rectangle drawing on the map, the globe projection, the dark theme of the offline map, the table views.
- CSV for MODIS years or a multi-year range offline: the local sample is VIIRS 2013 only.
- The final Cloud Run deploy (not part of this test) and the screenshots of the final release.

Screenshots of these runs are kept outside the repository; which ones go into `artifacts/screenshots/` is decided with
the D12 screenshot evidence (PR 53).
