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
| L4 | Names confirmed on every task; submission owner and demo lead named | All | 🔄 | Roles confirmed; demo lead and video-vs-slides still open |
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
| H13 | Methodology and limitations text ([methodology.md](methodology.md)); reproducibility run from a clean clone | Justino + Jean | Sun 18:00 | ⬜ | |

## Team Dashboard

Spec: [spec/dashboard.md](spec/dashboard.md). Build on the mock first; switch to real data at Checkpoint B.

| # | Task | Owner | Due (local) | Status | Deliverable |
|---|------|-------|-------------|--------|-------------|
| D1 | App skeleton in `app/` with a `Dockerfile` serving on `$PORT`, `/healthz` | Guilherme + Cleber | Sat 21:00 | ✅ | On `main` (FastAPI + React/Vite, design system, shared state) |
| D2 | Data access: read `calendar` (mock → bucket); sum cells for an area; median and anomalies on the sum | Guilherme + Cleber | Sat 23:00 | ✅ | `GET /api/calendar` on the real `calendar/v1` (Cleber). Open: widen the interval of a summed area for correlated cells (`n^0.32`) |
| D3 | Map with L2 cells; rectangle draw and lat/lon bounds → list of cells | Guilherme | Sat 23:00 | ⬜ | **Checkpoint A** |
| D4 | Calendar heatmap (year × month), color-blind-safe ramp, estimated months marked, legend | Cleber | Sat 23:00 | ✅ | **Checkpoint A**: on `main`, running on a synthetic fixture; real `calendar/v1` comes with D2 |
| D5 | This month vs historical median card; date-range selector | Cleber | Sun 02:00 | ⬜ | |
| D6 | CSV download of native hotspots for area + dates | Guilherme + Cleber | Sun 02:00 | ⬜ | **Checkpoint B** |
| D7 | Map ↔ calendar linked by one shared state | Guilherme | Sun 02:00 | ⬜ | |
| D8 | First Cloud Run deploy ([runbook](../deploy/cloudrun/README.md)); Kali approves the deploy | Guilherme + Cleber; Kali approves | Sun 09:00 | ⬜ | Public URL |
| D9 | Should-haves: raw vs harmonized toggle + trend; uncertainty; day/night; anomaly mode; seasonal profile | Cleber + Guilherme | Sun 15:00 | ⬜ | **Checkpoint C** = must-haves live |
| D10 | "How to read / limitations / sources" panel; all text in English | Jean | Sun 13:00 | ⬜ | |
| D11 | Stretch (only if "go" at Checkpoint C): AGGS drill-down to L3 with neighbors | Guilherme | Sun 15:00 | ⬜ | |
| D12 | Final deploy, offline fallback (local container), screenshots in `artifacts/screenshots/` | Guilherme + Cleber; Jean screenshots | Sun 18:00 | ⬜ | |

## Submission

| # | Task | Owner | Due (local) | Status |
|---|------|-------|-------------|--------|
| S1 | Project page fields drafted in English (summary, description, NASA data, references) | Kali + Jean | Sun 20:00 | ⬜ |
| S2 | Demo: ≤ 30 s video (English subtitles) or ≤ 7 slides; storyboard by Sun 13:00 | Jean (proposed) | Sun 21:00 | ⬜ |
| S3 | References list: every data source, library, tool; FIRMS citation and disclaimer link | Justino | Sun 20:00 | ⬜ |
| S4 | AI-use statement for the form + acknowledgment in the repo ([resources.md](resources.md#ai-usage)) | Kali | Sun 20:00 | ⬜ |
| S5 | All links tested in a private window; repo public and in English | Second reviewer (other team) | Sun 22:00 | ⬜ |
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
