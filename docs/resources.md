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
| [magma colormap](https://bids.github.io/colormap/) (van der Walt and Smith, in Matplotlib) | Seven colors sampled for the heatmap and map sequential ramp (`--magma-*`) | CC0 |
| [uv](https://docs.astral.sh/uv/) | Python env and locked dependencies | Apache-2.0 / MIT |
| [Python](https://www.python.org/) 3.12 | Pipeline language | PSF |
| [gcsfs](https://github.com/fsspec/gcsfs) | Optional `gs://` access in the pipeline; the dashboard reads `hotspots/v1` from the bucket with it for the CSV download (D6) | BSD-3-Clause |
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

Base UI Dialog custom focus management: https://base-ui.com/react/components/dialog#custom-focus-management — existing-library API used for the D10 initial title focus correction.

## Official notices: satellite gaps and orbit changes

Checked on Sun Nov 15, 2026 against NASA (Earthdata alerts, LAADS DAAC, MODIS MCST, NTRS, Terra project) and NOAA
(OSPO / ESPC) notices. "Our gap" is what the data shows ([methodology.md, Observation gaps](methodology.md#observation-gaps)
and the 2026 pull in H9); "Official window" is what the notice says. Our rule only flags days with at least 30
expected detections, so it can be shorter than the official window.

### End of orbit maintenance (Aqua and Terra)

| Satellite | Official dates | What our data shows | Source |
|-----------|----------------|---------------------|--------|
| Terra | Last inclination adjust maneuver (IAM) **2020-02-27**; last drag make-up maneuver 2022-07-28; constellation exit maneuvers (orbit lowered about 5.5 km) **2022-10-12 and 2022-10-19**. Since the last IAM the equator crossing time drifts earlier | Daytime overpass stable at 10:25–10:30 through 2020, earlier from 2021 (10:15 in 2022, 09:13 in 2025): consistent, the drift starts slowly after the last IAM | Twedt et al. (2023), *Impact of satellite orbit drift on MODIS Earth scene observations used in calibration of the reflective solar bands*, Proc. SPIE, Table 1, NASA NTRS https://ntrs.nasa.gov/citations/20240001409 · Terra project, orbital drift: https://terra.nasa.gov/about/terra-orbital-drift-information |
| Aqua | Last IAM **2021-03-18**; last drag make-up maneuver **2021-12-01**. Since the last IAM the crossing time drifts later. No constellation exit maneuver is listed for Aqua (the paper lists them for Terra only) | Daytime overpass stable at 13:35–13:40 through 2021, later from 2022 (13:43, then 14:56 in 2025): consistent | Twedt et al. (2023), NASA NTRS https://ntrs.nasa.gov/citations/20240001409 · NASA Aqua mission page ("completed the last of its drag makeup maneuvers in December 2021"; now drifting to later crossing times and slowly descending below the A-Train, no exit date given): https://science.nasa.gov/mission/aqua · NASA A-Train page (Aqua "slowly drifted out of the constellation" after its last drag make-up maneuver in December 2021; +50 min crossing-time drift and about 690 km altitude as of January 2025): https://atrain.nasa.gov |

### Data gaps

| Satellite | Our gap | Official window and event | Status | Source |
|-----------|---------|---------------------------|--------|--------|
| Terra | 2003-12-17 → 12-23 | Spacecraft safe mode on 2003-12-16 (ACE-B anomaly); MODIS back to standby 12-22, science mode 12-24 | Confirmed | MODIS MCST, Terra weekly report 2003/354–360: https://mcst.gsfc.nasa.gov/iot/am1weekly2003-3542003-360 |
| S-NPP | 2012-03-24 → 03-26 | Satellite safe mode on 2012-03-24; instruments recovered by 03-26 (during commissioning) | Confirmed by a secondary source; no NASA/NOAA notice found | CIMSS (U. Wisconsin) satellite blog: https://cimss.ssec.wisc.edu/satellite-blog/archives/10087 |
| Terra | 2016-02-22 → 02-25 | Safe hold during an inclination maneuver on 2016-02-18; recovered 02-22; MODIS science mode 02-24 | Confirmed | Earthdata alert: https://www.earthdata.nasa.gov/data/alerts-outages/terra-satellite-enters-safe-mode · MCST summary: https://mcst.gsfc.nasa.gov/news/mcst-summary-terra-modis-safe-mode-recovery |
| Aqua | 2020-08-16 → 08-30 (three runs) | Formatter-Multiplexer Unit / Solid State Recorder error from 2020-08-16 09:26 UTC to 09-02; the period was reprocessed only from limited direct-broadcast data, which explains the few detections inside our gap | Confirmed | LAADS DAAC: https://ladsweb.modaps.eosdis.nasa.gov/alerts-and-issues/171856 · Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/aqua-satellite-anomaly-update |
| Aqua | 2022-03-31 → 04-11 | Spacecraft safe mode on 2022-03-31 (power controller swap); MODIS back in science mode about 04-14/15, all products distributed from 04-17 | Confirmed (official window is longer) | Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/aqua-safe-mode-alert · MCST: https://mcst.gsfc.nasa.gov/news/aqua-safe-mode-event |
| S-NPP | 2022-07-27 → 08-10 | Spacecraft safe mode on 2022-07-26 16:25 UTC; VIIRS operational on 08-10; data not recoverable | Confirmed | Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-recovers-from-safe-mode · NSIDC: https://nsidc.org/data/user-resources/data-announcements/update-snppviirs-safe-mode |
| Terra | 2022-10-10 → 10-22 | Constellation exit maneuvers; data outage 2022-10-10 → 10-19, MODIS nominal day/night mode from 10-22 | Confirmed | Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/terra-constellation-exit-data-outage |
| NOAA-20 | 2023-07-19 → 07-22 | No notice found. NOAA's 2023 ESPC message list has no NOAA-20 event in July (the S-NPP safe mode was on 07-26). A MODAPS processing issue from 07-21 affected NOAA-20 VIIRS, but it started after our gap and MODIS shows no gap then | **Not confirmed** | NOAA ESPC messages 2023: https://www.star.nesdis.noaa.gov/jpss/ESPCMessages.php?year=2023 · Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/modis-viirs-forward-processing-resumes |
| S-NPP | 2024-05-30 → 06-03 | GPS anomaly from 2024-05-25 degraded geolocation; normal production from 06-05 | Confirmed | Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-viirs-data-product-geolocation-anomaly-may-2024 |
| S-NPP | 2024-07-10 → 07-16 | GPS anomaly; data gaps from 2024-07-09 21:42 UTC to 07-16 17:42 UTC | Confirmed | Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-viirs-data-product-geolocation-anomaly-july-2024 |
| S-NPP | 2024-07-25 → 07-28 | Satellite outage on 2024-07-24 05:28–18:22 UTC; VIIRS processing held for quality checks, alert resolved 08-05 | Likely (our gap is longer than the outage itself) | Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-viirs-data-product-anomaly-july-2024 |
| S-NPP | 2024-11-03 → 11-06 | GPS anomaly from 2024-11-02 02:31 UTC; recovered 11-06 | Confirmed | Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-viirs-data-product-anomaly-november-2024 |
| S-NPP | 2026-03-10 → 03-12 | Anomaly from 2026-03-09 17:45 UTC; data from 03-09 18:00 to 03-13 08:12 UTC not processed | Confirmed | Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-data-imagery-caution-advised |
| S-NPP | 2026-04-28 → 04-30 | Data unavailable from 2026-04-28 about 02:30 UTC; outage to 05-01 05:00 UTC; gap not filled | Confirmed | Earthdata: https://earthdata.nasa.gov/data/alerts-outages/data-outage-alert-suomi-npp-near-real-time-nrt-standard-products |
| S-NPP | 2026-06-01 → 06-02 | VIIRS data outage / anomaly on 2026-06-01, resolved 06-10 | Confirmed | Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-viirs-data-outage-anomaly-june-1-2026 |
| S-NPP | 2026-07-11 → 07-16 | Non-nominal state from 2026-07-10; outage to 07-17 04:00 UTC | Confirmed | Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-viirs-data-outage-anomaly-july-10-2026 |
| S-NPP | 2026-08-03 | Anomaly from 2026-08-02 02:05 UTC | Confirmed | Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-viirs-data-outage-anomaly-august-2-2026 |
| S-NPP | after 2026-11-02 | New observations cease on 2026-11-02 (NASA); NOAA ends delivery of S-NPP products on 2026-11-01 13:00 UTC. FIRMS data in our pull end on 11-02 | Confirmed (the two notices differ by one day) | Earthdata: https://www.earthdata.nasa.gov/data/alerts-outages/reminder-new-suomi-npp-observations-cease-november-2-2026 · NOAA NESDIS: https://www.nesdis.noaa.gov/news/cessation-of-suomi-national-polar-orbiting-partnership-s-npp-data-users-onafter-november-01-2026 |

Where to look for new events: Earthdata alerts and outages https://www.earthdata.nasa.gov/data/alerts-outages ·
LAADS DAAC alerts https://ladsweb.modaps.eosdis.nasa.gov/alerts-and-issues

## AI usage

**Required by the rules.** The submission must say how AI tools were used, and AI-generated code and data must be
acknowledged in descriptive text and metadata (images/video need a visible watermark). Record each use here as it
happens. See [challenge/official-requirements.md](challenge/official-requirements.md#ai-super-intelligence-rules).

| What | Tool | Notes |
|------|------|-------|
| H13 audit of the VM reproduction: logs, manifests and data (`artifacts/h13-reproducibility/vm-audit.md`) and the evidence-status text | Claude (Anthropic) | Read-only checks on the VM and against the bucket, written up for Justino |
| H13 methodology completion, limitations, local 84-test audit, PR 38 evidence review and integration package | AI assistance | Prepared for Jean Gustavo from existing team work. No new model or production dataset was generated. Full VM reproduction is attributed to its original report; the local audit did not have production inputs. |
| Historical FIRMS ingestion and monthly aggregation implementation, regression fixture, and runbook | Codex | Assisted with pipeline code and verification. Historical detections come from NASA FIRMS. See [historical batch](historical-batch.md). |
| Burning calendar (task D4): `app/frontend/src/features/calendar/`, `src/data/calendarSource.ts`, `src/data/useCalendar.ts`, `src/styles/calendar.css`, unit tests, and the script that builds the fixture | Claude Code (Claude Sonnet 5.5, Anthropic) | Code written with AI assistance for Cleber, the task owner. The solution idea (a year x month heatmap of hotspot counts) comes from the challenge brief, not from AI. The fixture `app/frontend/src/data/fixtures/calendar-mock.json` is **synthetic** (from `astro-fire mock-calendar`), for building screens only |
| Historical dashboard calendar assembly, regression fixture, and verification | Codex | Implemented the H7 integration using the team's calibration functions, factors and coverage rules. |
| Calendar data access (task D2): `app/backend/astro_dashboard/{calendar,api}.py`, `app/backend/tests/test_calendar_api.py`, the API client in `app/frontend/src/data/`, and the app README section | Claude Code (Claude Sonnet 5.5, Anthropic) | Code written with AI assistance for Cleber, the task owner. The rules (sum cells first, absent rows, pending intervals) come from the data contract written by the Harmonization team. Checked against direct sums of the real `calendar/v1` |
| Calendar UX: magma color ramp and `scripts/check_viz_ramp.py`, quantile color scale, month filter and peak shortcut, hover highlight (`app/frontend/src/features/calendar/`, `src/styles/`, `docs/design-system.md`) | Claude Code (Claude Sonnet 5.5, Anthropic) | Code and documentation written with AI assistance for Cleber. The direction (magma colors, month filter, hover highlight) was chosen by Cleber. The magma colors are sampled from the open matplotlib colormap; the ramp check is our own script. Screenshots used to review the page were taken with Chromium through Playwright and are not part of the product |
| Calendar theme: ember color ramp, petrol and ash primitives, scoped `.calendar-theme` styles, state marks, horizontal legend, locale constant (`app/frontend/src/features/calendar/`, `src/styles/`, `scripts/check_viz_ramp.py --theme calendar`, `docs/design-system.md`) | Claude Code (Claude Sonnet 5.5, Anthropic) | Code and documentation written with AI assistance for Cleber, who set the visual direction in a written description. The ember colors are our own (interpolated in CIELAB between five anchors and checked by our script). Screenshots used to review the page were taken with Chromium through Playwright and are not part of the product |
| Same-days comparison for the unfinished month (task D5): `app/backend/tests/test_same_days_api.py`, the API client mapping in `app/frontend/src/data/calendarSource.ts`, `app/frontend/src/lib/metrics.ts` (`latestComparison`), the headline tile wording in `KpiRow.tsx` | Claude Code (Claude Sonnet 5.5, Anthropic) | Code written with AI assistance for Cleber, the task owner. The rule (compare the unfinished month with the same days of earlier years) comes from the dashboard spec; the data layer `month_to_date` and its eligibility rule were written by the Harmonization team. Checked against the real calendar and layer |
| Dashboard design system, map and area selection (task D3), layout, filter bar and KPI row: `app/frontend/src/{styles,components,features/dashboard,lib}/`, `app/backend/astro_dashboard/cells.py`, their tests, and the integration of the burning calendar into the layout | Claude Code (Anthropic; Claude Opus 5.5 for the integration) | Code written with AI assistance for Guilherme, the task owner. The solution idea (map of cells, area selection, calendar) comes from the challenge brief and the dashboard spec, not from AI. Rules (sum cells first, absent rows, partial months never read as little activity) come from the data contract |
| Dashboard should-haves (task D9): raw counts per satellite in `app/backend/astro_dashboard/calendar.py`, the raw and anomaly views of the calendar, `app/frontend/src/lib/charts.ts`, `app/frontend/src/features/charts/` (trend chart, seasonal profile), `src/styles/charts.css`, their tests | Claude Code (Anthropic; Claude Fable 5.2) | Code written with AI assistance for Kali. The views come from the dashboard spec (raw vs harmonized, anomaly mode, seasonal profile); the rule that satellites are never added comes from the scientific guardrails. Written without a local browser check: CI ran typecheck, tests and the build |
| Checking the satellite gaps and orbit dates against official NASA and NOAA notices ([section above](#official-notices-satellite-gaps-and-orbit-changes)) | Claude Code (Anthropic) | Web search and reading of the notices for Justino; every link was opened and its dates compared with our data. The gaps themselves were found by the team's pipeline |
| D10 wording review: `app/frontend/src/features/dashboard/AboutDialog.tsx`, task-board note and diary entries | AI coding assistant | AI-assisted text corrections for Jean Gustavo: provisional NRT type exception, filtered and normalized native CSV, Count-mode colors, and qualified wording about the 2012 sensor transition. Based on the team's existing data contract and specifications; no new data, model, numerical result or solution idea generated. |
| Review of the H13 pull requests (51, 52) against the code and artifacts, re-run of the early-years and 2026 ingest commands, republication of the 2026 partition of `hotspots/v1` with the `type` column corrected, and the task-board, methodology and diary records of it | AI coding assistant | Checks run and records written for Kali. No change to the method, the counts or the calendar |
