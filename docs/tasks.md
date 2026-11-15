# Task board

Status: ⬜ not started · 🔄 in progress · ✅ done · ⛔ blocked / needs a decision

A task is done only when its deliverable exists, someone else can reproduce it, and it meets its acceptance criteria.
Plan: [project-plan.md](project-plan.md) · Schedule and checkpoints: [timeline.md](timeline.md).

> Owners confirmed by the team on Sat Nov 14 ([team.md](team.md)). **The owner of a task decides its specifics**
> (within the guardrails and the data contract) and logs the choice as a `DECISION`.
> Jean is the floater: ask him when a task needs a second pair of hands.

## Lock-in (Sat 18:30–19:30, everyone)

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| L1 | Answer the [open decisions](project-plan.md#open-decisions) Q1–Q12; log each as `DECISION` | Kali + Jean (logs) | ⬜ | Defaults apply if unanswered |
| L2 | Dashboard stack chosen and logged | Dashboard | 🔄 | Option A chosen: FastAPI + SPA. Frontend framework still to name |
| L3 | Data contract v1 frozen ([data-dictionary.md](data-dictionary.md)) | Mateus + Guilherme | ⬜ | One reviewer per team |
| L4 | Names confirmed on every task; submission owner and demo lead named | All | ✅ | Final-delivery roles set at Jean's request: Jean leads S2, a seven-slide English deck; Kali remains submission owner (S6); Jean selected Justino for the cross-team final review (S5). See [delivery roles](delivery-roles.md). This closes role/format assignment, not execution or submission. |
| L5 | All 6 registered on the **same Local Event** and on the team's Members tab | Kali | ✅ | Confirmed by Kali, Sat Nov 14 |
| L6 | Existing prototype scripts (harmonization pipeline, step-by-step example) brought into the repo, in English | Kali | ⬜ | Reuse before rewriting |

## Team Harmonization

Spec: [spec/harmonization.md](spec/harmonization.md). Commands run locally on a sample and on the VM on Brazil.

| # | Task | Owner | Due (local) | Status | Deliverable |
|---|------|-------|-------------|--------|-------------|
| H1 | Mock `calendar` sample with the v1 columns | Mateus (delivered by Kali) | Sat 19:30 | ✅ | `uv run astro-fire mock-calendar` → `data/processed/calendar/mock/` ([how](data-dictionary.md#6-sample-for-app-development)); synthetic numbers |
| H2 | `ingest`: zips → Brazil CSVs → Northeast clip → normalized `hotspots/v1` (IDs, UTC time, local solar date, cells, filter flags) | Mateus | Sat 22:00 | ✅ | Full 2003–2025 MVP local Parquet + manifest prepared for H3 QA; bucket publication pending |
| H3 | QA report: rows, duplicates, ranges, `version` by sensor and year, confidence and type tables | Justino | Sat 22:30 | ✅ | `artifacts/20261115T003611Z_ingest_2e2b2e/qa.md` |
| H4 | `aggregate` → `cell_month_counts/v1` (Northeast) | Mateus | Sat 23:00 | ✅ | **Checkpoint A**: full 2003–2025 local Parquet + manifest; bucket publication pending |
| H5 | Calibration prototype on a sample: F, B, pooling; reproduce the worked example | Kali | Sat 23:00 | ✅ | `src/astro_fire/calibration.py` + `tests/test_calibration.py` (synthetic sample; real data comes with H4) |
| H6 | `calibrate` on the Northeast, 2012–2019 → `factors/v1` | Kali | Sun 01:00 | ✅ | Real counts: 74,592 factor rows, pooling to L1, K = 50, M = 5, Terra-aware background, reconciled with λ = 0.75 ([results](methodology.md)). Published to the bucket (`fb-l1-terra-rec-4`) |
| H7 | `harmonize` → `calendar/v1` (no estimated intervals yet) pushed to the bucket | Mateus | Sun 02:00 | ✅ | **Checkpoint B data**: 23 historical year partitions, model `fb-l1-terra-3` |
| H8 | Before/after-2012 chart (raw vs harmonized) for the demo region | Kali | Sun 02:00 | ✅ | `artifacts/figures/before_after_2012.png` (+ `.svg`, `.json`); `scripts/figure_before_after.py`. No uncertainty band yet |
| H9 | Put the team's MAP_KEY in `.env` (VM and local, never in git); pull 2026 for the Northeast (S-NPP + NOAA-20, SP and NRT); log in `SOURCES.md` | Justino | Sun 09:00 | ✅ | `raw/firms/api/<SOURCE>/-48.8_-18.4_-34.7_-1.0/`: 127 chunk files, SP to 2026-07-31, NRT to 2026-11-14 (S-NPP to 11-02); on the VM, bucket upload pending |
| H10 | `validate`: baselines (global ratio, OLS, month-only) vs F and F + B on 2020–2021; K, M by cross-validation | Kali | Sun 10:00 | ✅ | Final test on 2022–2023, opened once: passes the pre-set rule (cell MAE 3.46 vs 4.22 for the best baseline; regional totals level). All methods are 6% high there and 20% high in 2024–2025 ([methodology.md](methodology.md)) |
| H11 | Bootstrap intervals; anomalies; NOAA-20 continuity factor; partial month → `calendar/v1.1` | Kali + Mateus | Sun 11:00 | ✅ | `calendar/v1` in the bucket, 2003-01 → 2026-11: intervals (94% coverage on 2020–2021), anomalies, NOAA-20 continuity (1.041), 2026 from the API, November 2026 partial and compared with the same days of earlier years |
| H12 | Should-haves: Terra-only 2000-11 → 2002-06; sensitivity to the confidence filter | Kali | Sun 15:00 | ✅ | Filter sensitivity: the result holds with all confidence classes (`artifacts/metrics/filter_sensitivity.md`). Record extended to 2002-07 with Aqua. Terra-only months fitted and checked but **not published**: the Terra–Aqua daytime relation was not stable backward ([methodology.md](methodology.md#extending-the-record-before-2003)) |
| H13 | Methodology and limitations text ([methodology.md](methodology.md)); reproducibility run from a clean clone | Justino + Jean | Sun 18:00 | ✅ | Methodology and limitations written (Jean, PR 51), checked against the code and the artifacts. Full-data reproduction from a clean clone on the VM ([report](../artifacts/h13-reproducibility/report.md)) and audit of its logs, manifests and data ([VM audit](../artifacts/h13-reproducibility/vm-audit.md)): every stage matches the published runs (Justino, PRs 38 and 52). The reproduction ran at commit `5286248`; the early-years and 2026 ingest commands were run again on the current code with the same counts, the full pipeline was not. Found on review and fixed: the published 2026 detections stored `type = 0` for near-real-time rows; republished with `type` null ([methodology.md](methodology.md#reproducibility-and-evidence-status)) |

## Team Dashboard

Spec: [spec/dashboard.md](spec/dashboard.md). Build on the mock first; switch to real data at Checkpoint B.

| # | Task | Owner | Due (local) | Status | Deliverable |
|---|------|-------|-------------|--------|-------------|
| D1 | App skeleton in `app/` with a `Dockerfile` serving on `$PORT`, `/healthz` | Guilherme + Cleber | Sat 21:00 | ✅ | On `main` (FastAPI + React/Vite, design system, shared state) |
| D2 | Data access: read `calendar` (mock → bucket); sum cells for an area; median and anomalies on the sum | Guilherme + Cleber | Sat 23:00 | ✅ | `GET /api/calendar` on the real `calendar/v1` (Cleber); summed-area interval widened by `n_cells^0.32` (Guilherme) |
| D3 | Map with L2 cells; rectangle draw and lat/lon bounds → list of cells | Guilherme | Sat 23:00 | ✅ | **Checkpoint A**. On `main` since PR 26 and live: MapLibre map of the L2 cells of the selected month (`GET /api/cells`), "Draw area" (rectangle), "Use visible area" and typed lat/lon bounds; the area resolves to the cells that overlap the box, the same rule as the calendar API. Seen on the live page; drawing a rectangle by hand not re-checked |
| D4 | Calendar heatmap (year × month), color-blind-safe ramp, estimated months marked, legend | Cleber | Sat 23:00 | ✅ | **Checkpoint A**: on `main`, running on a synthetic fixture; real `calendar/v1` comes with D2 |
| D5 | This month vs historical median card; date-range selector | Cleber | Sun 02:00 | ✅ | Headline tile (PR 36): the latest month against its median, an unfinished month against the same days of earlier years. From/To year selectors drive the calendar, the KPIs and the CSV. Checked on the live page (From 2015: 12 rows, "0 of 143" estimated, CSV says 2015–2026). The selector starts in 2002, where the data starts (live since revision `astro-dashboard-00003-rh9`) |
| D6 | CSV download of native hotspots for area + dates | Guilherme + Cleber | Sun 02:00 | ✅ | **Checkpoint B**. `GET /api/hotspots.csv` reads `hotspots/v1` from the bucket (Guilherme). Live since revision `astro-dashboard-00002-q4v` (2026-11-15): 2,064 rows for 16 cells in 2013 in about 4 s. The popover has not been checked by eye |
| D7 | Map ↔ calendar linked by one shared state | Guilherme | Sun 02:00 | ✅ | Checked on the live page (2026-11-15): clicking October 2015 in the calendar turns the map to October 2015; "Use visible area" on the zoomed map sets a custom area (924 grid cells, 918 with data) and the calendar reloads for it, keeping the selected month. Not checked: drawing a rectangle by hand, a phone. The area button counts grid cells and the calendar counts cells with data, so the two numbers differ |
| D8 | First Cloud Run deploy ([runbook](../deploy/cloudrun/README.md)); Kali approves the deploy | Guilherme + Cleber; Kali approves | Sun 09:00 | ✅ | Deployed 2026-11-15 03:55 UTC, approved by Kali: <https://astro-dashboard-301238386836.us-central1.run.app> (revision `astro-dashboard-00001-ktn`, image `b9f02c6`, calendar `fb-l1-terra-rec-4` and `month_to_date/v1` baked in). Built on Cloud Build. `/healthz` is not reachable on the run.app URL (reserved by Cloud Run); use `/api/version` |
| D9 | Should-haves: raw vs harmonized toggle + trend; uncertainty; day/night; anomaly mode; seasonal profile | Cleber + Guilherme | Sun 15:00 | ✅ | **Checkpoint C** = must-haves live. In the code (PR 43): "Raw by sensor" and "Anomaly" views of the calendar, trend chart (harmonized, Aqua MODIS raw, S-NPP VIIRS raw), seasonal profile with the 90% interval of estimated months, day / night / all. Live and seen in Chrome (trend, seasonal profile, anomaly, raw view); the visual fixes of PR 45 are live since revision `astro-dashboard-00005-dz6` and were checked there. Not seen: a phone, the light theme. Not done from the spec list: download of the calendar table and chart images, free polygon drawing |
| D10 | "How to read / limitations / sources" panel; all text in English | Jean | Sun 13:00 | ✅ | Panel from PR 44, wording corrections and title focus from PR 47, live since revision `astro-dashboard-00006-bll` (image `5ae8caa`, sixth deploy, 2026-11-15 09:27 UTC, approved by Kali). Checked on the public page at 1280 × 720 (dark and light) and 390 × 844 (emulated phone): the title is in view when the panel opens, the four corrected passages are shown and the old ones are gone, five sections and four links, End / Home / Page Down and touch-style scrolling reach the whole text, Close and Escape close it and return the focus to "How to read". Month names are English. Not checked: a physical phone, a screen reader, a formal contrast audit. Record: [D10 validation](d10-validation.md) |
| D11 | Stretch (only if "go" at Checkpoint C): AGGS drill-down to L3 with neighbors | Guilherme | Sun 15:00 | ✅ | "Go" logged at 11:20 UTC. Live since revision `astro-dashboard-00007-dnd` (12:06 UTC), still on `astro-dashboard-00008-m2v`. `GET /api/drilldown` (PR 57) reads the native detections of the month's source satellite from the bucket: L3 split of the cell and the 3 × 3 block of L2 cells, stop rules (depth L3, at least 5 detections). Map drill mode (PR 60): a click on a cell opens its sub-cells and neighbor counts, with a "not harmonized" legend; Back or Escape returns. Checked on the live URL at 16:53 and 17:01 UTC: G083135.16, September 2013 = S-NPP, 639 detections, 16 L3 cells; clicked through in a browser with WebGL ([screenshot 11](../artifacts/screenshots/11-drilldown-desktop.jpg), [record](d12-validation.md#final-capture-on-revision-00008)). Not verified: a physical phone, a screen reader |
| D12 | Final deploy, offline fallback (local container), screenshots in `artifacts/screenshots/` | Guilherme + Cleber; Jean screenshots | Sun 18:00 | ✅ | Final deploy: revision `astro-dashboard-00008-m2v` (16:50 UTC), approved by Kali. Offline fallback tested on a local container with real data and the external network blocked (PR 58, [record](d12-offline-test.md), `deploy/local/run-offline.sh`): no basemap offline, CSV only for the years copied locally. Screenshots: 01–08 on revision 00006 (Jean), 09–19 on revision 00008, 20 from the local offline run, with viewport, measured pixels, settings and SHA-256 in the [manifest](../artifacts/screenshots/screenshots-manifest.json) ([record](d12-validation.md#final-capture-on-revision-00008)). Not verified: a physical phone, Safari or Firefox |

## Submission

| # | Task | Owner | Due (local) | Status |
|---|------|-------|-------------|--------|
| S1 | Project page fields drafted in English (summary, description, NASA data, references) | Kali + Jean | Sun 20:00 | 🔄 Draft of every field in [submission.md](submission.md); FIREWATCHER name confirmed by Jean; editorial review of sensor transitions, NRT and reproducibility prepared; pending the demo link and final review by Kali and Jean |
| S2 | Demo: seven slides in English, including title and intro; storyboard by Sun 13:00 | Jean | Sun 21:00 | ⬜ |
| S3 | References list: every data source, library, tool; FIRMS citation and disclaimer link | Justino | Sun 20:00 | ✅ Final review done: every data source, library and service in [resources.md](resources.md), with citations, DOIs and the LANCE disclaimer link; every link checked |
| S4 | AI-use statement for the form + acknowledgment in the repo ([resources.md](resources.md#ai-usage)) | Kali | Sun 20:00 | 🔄 Statement drafted in [submission.md](submission.md#use-of-super-intelligence-ai); Kali's tasks added to the AI-usage table; one point to confirm by Kali |
| S5 | All links tested in a private window; repo public and in English | Justino (cross-team final review) | Sun 22:00 | ⬜ |
| S6 | Submitted; confirmation saved | Kali | Sun 22:30 | ⬜ |

## Done earlier

| Task | Owner | Notes |
|------|-------|-------|
| Local Event timezone confirmed | Kali | Brasília (UTC−3) |
| MODIS 2000–2025, VIIRS S-NPP 2012–2025, NOAA-20 2018–2025 pulled and uploaded | Justino, collaborator | 48 zips, checksummed, in the bucket |

## Cloud setup (done) — Google Cloud primary, local fallback

Order and commands: [cloud/README.md](cloud/README.md#setup-order-kali-when-ready-each-step-asks-before-changing-anything).
Every script remains a dry run by default. The live foundation was provisioned on Nov 14; see the status below.

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| C0 | Repo scaffold: pipeline package, config, smoke test, infra scripts, runbooks, CI | Kali | ✅ | ADR 0004 |
| C1 | Install gcloud CLI; `gcloud auth login` + `application-default login` | Kali | ✅ | gcloud 593.0.0; project and ADC configured |
| C2 | Create/pick GCP project; link billing; check credit eligibility | Kali | ✅ | `astro-boys`; billing enabled; credit confirmed by owner |
| C3 | Budget alert (50/80/90/100% actual + 100% forecast) | Kali | ✅ | BRL 250/month gross usage; [budget-and-cost.md](cloud/budget-and-cost.md) |
| C4 | Decide region/zone, bucket name; fill `infra/gcp/gcp.env`; run preflight | Kali | ✅ | `us-central1` / `us-central1-a` |
| C5 | Enable APIs, create bucket, service accounts | Kali | ✅ | Private bucket + least-privilege runtime identities |
| C6 | Create VM; bootstrap; smoke test on VM | Kali / Harmonization | ✅ | 30 rows passed; VM is stopped |
| C7 | Collect teammates' Google accounts; grant team access | Kali | ✅ | Team owner confirmed access was already configured; unchanged |
| C8 | Artifact Registry repo for the dashboard | Kali | ✅ | Empty Docker repo `astro` ready in `us-central1` |
| C9 | Upload raw zips from the team Drive to `raw/firms/global/` | Collaborator | ✅ | 48 ZIPs verified in GCS: MODIS 26, S-NPP 14, NOAA-20 8 |
| C10 | Confirm CI passes on GitHub (first push) | Kali | ✅ | Two successful CI runs on `main` |
| C11 | Deploy dashboard container to Cloud Run | Dashboard / Kali | ⛔ | Cloud base is ready; waits for a runnable app container/Dockerfile |
