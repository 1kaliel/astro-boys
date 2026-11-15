# Project context: Astro Boys, Harmonization of MODIS and VIIRS Hot Spots

One-page orientation for anyone joining the project, human or AI agent. It summarizes the docs listed in
[Sources](#sources); when they disagree with this file, the source docs win. Snapshot taken on 2026-11-14 (Sat),
after the D1 skeleton on branch `feat/app-skeleton`.

Written for: team members and AI coding agents who need the whole picture before touching the repo.

## 1. What we are building

NASA's satellite fire records are split across two instruments. MODIS (Terra, Aqua; 1 km pixels) covers 2000 to
2025. VIIRS (S-NPP from 2012, NOAA-20 from 2018; 375 m pixels) sees several times more hotspots, especially small
and night-time fires. Joining the raw counts creates a false jump in 2012, so managers cannot tell real change in
fire activity from a change of instrument. MODIS is near end of life, and S-NPP stopped observing on 2026-11-02.

We deliver:

1. **A harmonized hotspot dataset:** monthly VIIRS-equivalent counts per 0.25° cell for Northeast Brazil, from the
   early 2000s to today, with origin labels and uncertainty, validated on years the model never saw.
2. **A web app (public URL):** pick an area and a date range, then see a burning calendar (year × month), this
   month vs the historical median, anomalies, raw vs harmonized comparison, and a CSV download.
3. **Evidence:** a validation table against simple baselines, and a before/after-2012 chart.
4. **Submission:** project page in English, a 30-second video or 7 slides, public repo, AI-use statement.

Pilot region: **Northeast Brazil only** (Maranhão, Piauí, Ceará, Rio Grande do Norte, Paraíba, Pernambuco, Alagoas,
Sergipe, Bahia). Brazil-wide and other countries are stretch.

Disclaimer carried in the product: hotspot detections and derived estimates are uncertain and must not be used alone
for emergency, public-safety or resource-allocation decisions.

## 2. Challenge and submission

- **Challenge:** Harmonization of MODIS and VIIRS Hot Spots (NASA Space Apps Challenge 2026). The brief is in
  [docs/challenge/brief.md](challenge/brief.md).
- **Only listed resource:** NASA Earthdata FIRMS (active fire / hotspot data).
- **Submission opens:** Sat 2026-11-14, 09:00 local (Brasília, UTC−3).
- **Submission closes:** **Sun 2026-11-15, 23:59 local** (= Mon 02:59 UTC). We aim to submit by **22:30**.
- **Team size:** max 6, everyone registered on the same Local Event. Judging time to confirm with the Local Lead.
- **Eligibility for global judging:**
  - Video ≤ 30 s **or** slides ≤ 7 (title and intro included). Exceeding the limit = not eligible.
  - English on the project page and in **all linked material, the repo included**. A video in another language
    needs English subtitles; slides must be English.
  - At least one NASA data source (FIRMS).
  - All links public, no login.
- **Project page fields:** name, summary, demo link, project link, detailed description, AI use (not shown to
  judges), NASA data, and references (every data source, code, text, image and tool).
- **Judging criteria (1–5 each):** Impact, Creativity, Validity, Relevance, Presentation.
- **AI rules:** AI may speed up development, but **must not be used to come up with the solution idea**. AI code
  and data are acknowledged in text and metadata; AI images and video carry a visible watermark. AI output must not
  use or modify NASA branding.
- Full list: [docs/challenge/official-requirements.md](challenge/official-requirements.md).

## 3. Scientific guardrails (non-negotiable, for everyone)

- MODIS and VIIRS are different instruments. Never treat raw counts as equivalent; never use one fixed multiplier.
- Never sum satellites raw (Terra + Aqua, or S-NPP + NOAA-20) into one series.
- Never compare brightness temperatures or confidence values across sensors. MODIS confidence is 0–100; VIIRS is
  `l`/`n`/`h`. They are not equivalent scales.
- A detection is a **hotspot**, not a fire, not a fire count, not burned area. Say "hotspots" or "fire activity".
- Estimates are per cell and month, at L2 or coarser. **No synthetic VIIRS points.**
- Every value keeps its origin (`MODIS_NATIVE`, `VIIRS_OBSERVED`, `VIIRS_EQUIVALENT_FROM_MODIS`). Every estimate
  carries an interval. Estimated months are visibly marked in the UI.
- Calibration and test years never mix. Methods must beat simple baselines out of sample, or we ship the baseline
  and say so.
- Missing is never zero. No detection is not "no fire".
- Index and z-score thresholds are product choices. Never present them as NASA thresholds or as probabilities.
- No prediction, risk or early-warning claims. Prediction is out of scope.
- Numbers quoted from elsewhere are hypotheses until we reproduce them or cite a primary source.

## 4. Method (Team Harmonization)

Spec: [docs/spec/harmonization.md](spec/harmonization.md). Method owner: Kali.

**Direction:** MODIS → VIIRS-equivalent, on the S-NPP scale. The future record is VIIRS-only, and small fires stay
visible. The reverse direction is a display option only.

**Transfer function, per cell `c` (L2), month of year `m`, period `p` (day / night):**

```text
VIIRS_equivalent = F(c,m,p) × Aqua     if Aqua > 0
                 = B(c,m,p)            if Aqua = 0

F = (ΣV⁺ + K·R) / (ΣA⁺ + K)           B = (ΣV⁰ + M·B_reg) / (n⁰ + M)
```

- Pair: **Aqua × S-NPP** (both about 13:30 / 01:30 local overpass).
- Calibrate on **2012–2019**; test on **2020–2021**, untouched until the final table.
- `R` is the regional ratio (pooling level: whole pilot extent, per month and day/night). `B_reg` is the regional
  background. `K` and `M` are picked by leave-one-year-out cross-validation from {0, 2, 5, 10, 20, 50}.
- Why ratio of sums, not mean of ratios: Poisson maximum-likelihood, no division by zero, busy months weigh more.
- Why `B`: without it `F × 0 = 0` erases small fires from the reconstructed past.
- Belize 2020 audit (team research): the VIIRS/MODIS ratio was 4.05 by day and 6.22 by night, with a daily IQR of
  2.50–6.75. This is why no single fixed multiplier is used.

**Implementation choices already logged (Kali, Sat Nov 14):** calibration universe is L2 cells with at least one
filtered Aqua or S-NPP detection; January 2012 is excluded (S-NPP starts 2012-01-20); the pooling region is the whole
extent; `K` and `M` are chosen separately.

**Series assembly:**

| Period | Source | `origin` |
|--------|--------|----------|
| 2012-02 → 2026-10 | S-NPP observed | `VIIRS_OBSERVED` |
| 2026-11 → | NOAA-20 observed × continuity factor `C` (expected close to 1; report it) | `VIIRS_OBSERVED` |
| 2002-07 → 2012-01 | `F × Aqua` or `B` | `VIIRS_EQUIVALENT_FROM_MODIS` |
| 2000-11 → 2002-06 (should-have) | Terra, fitted to Aqua 2003–2011 | `VIIRS_EQUIVALENT_FROM_MODIS`, wider interval |

**Validation (2020–2021), chronological only:** raw Aqua (reference); one global ratio; global OLS
`V = a·A + b` (the team's first proposal); month × day/night ratio without cell term; `F` with pooling;
`F` with pooling + `B` (expected final). Metrics: MAE, RMSE, relative bias, correlation, at cell-month and regional
monthly totals. Uncertainty: bootstrap over calibration years (200 resamples; 5th–95th percentile = 90% interval).
Main proof: the raw series steps at 2012; the harmonized one must not.

**Anomalies:** historical median `H`; absolute and percent anomaly; robust z-score `(obs − median) / (1.4826 × MAD)`,
flagged at `|z| ≥ 2` (product threshold). Sum cells first, then compute medians and anomalies.

**Known limits to state everywhere:** MODIS-only years cannot recover fires MODIS never saw; `B` is an average
background, not observed fire; orbits drift (calibration stops in 2019); CSV hotspots carry no "observed, no fire"
information; the 2012–2019 relation is assumed to hold for 2002–2011.

## 5. Data

| Source | Satellite | Years | Role |
|--------|-----------|-------|------|
| `modis_{YYYY}_all_countries.zip` | Aqua | 2002-07 → 2025 | Calibration; 2002–2011 estimates |
| same | Terra | 2000-11 → 2025 | Only source for 2000-11 → 2002-06 (should-have) |
| `viirs-snpp_{YYYY}_all_countries.zip` | S-NPP | 2012 → 2025 | Reference scale; observed to 2026-10 |
| `viirs-jpss1_{YYYY}_all_countries.zip` | NOAA-20 | 2018 → 2025 | Continuity after S-NPP; cross-check |
| FIRMS area API (`_SP`, `_NRT`) | S-NPP, NOAA-20 | 2026 | Current year; needs MAP_KEY |

- **Status:** 48 immutable zips in the bucket (MODIS 26, S-NPP 14, NOAA-20 8), 9.08 GiB, SHA-256 manifest.
- Raw files are never edited. Every download is logged in `data/raw/SOURCES.md`.
- FIRMS raw columns, units and pitfalls: [docs/data-dictionary.md](data-dictionary.md#raw-firms-fields-as-delivered).
  Key pitfalls: `acq_date`/`acq_time` are UTC; `acq_time` is HHMM text; `version` differs by year (keep it on every
  row); `type` 0 is vegetation fire; one row is a pixel, not a fire.
- Filters: `passes_main_filter = type == 0 AND (MODIS confidence >= 30 OR VIIRS confidence in (n, h))`. The same clip
  applies to every sensor.
- Local solar date = UTC + longitude/15 h. Night detections land on the right local day.

**Grid (AGGS-compatible, hierarchical 4×4 in WGS84 degrees):**

| Level | Size | Use |
|-------|------|-----|
| L1 | 1.0° | Regional pooling, overview map |
| **L2** | **0.25°** | **Harmonization unit** (factors, calendar) |
| L3 | 0.0625° | Drill-down of native detections only |

IDs look like `G078141.06` (L1 `G078141`, then `.NN` per level). Cells are not equal-area; say so where cells are
compared.

## 6. Architecture

```text
FIRMS zips + FIRMS API (2026)
   │ ingest (VM or laptop, Python + DuckDB)
   ▼
hotspots/v1 (native, partitioned Parquet)  ──►  CSV download, L3 drill-down
   │ aggregate → cell_month_counts/v1
   │ calibrate (2012–2019) → factors/v1
   │ harmonize → calendar/v1 (+ intervals, anomalies)
   │ validate (2020–2021) → artifacts/
   ▼
Cloud Storage bucket  ──read-only──►  Dashboard on Cloud Run
```

- **One codebase, two places.** `astro-fire` runs the same locally and on the VM. Only `ASTRO_DATA_ROOT` and the
  DuckDB memory limit change. Paths come from `astro_fire.storage.uri()`, never hard-coded.
- **Open formats:** partitioned Parquet, JSON manifests (inputs with checksums, outputs, row counts, code version,
  parameters) in `manifests/`. No BigQuery.
- **Dashboard stack (option A):** FastAPI backend with DuckDB reading Parquet; a single-page frontend served from the
  same container. The frontend framework (Angular or React) is **not yet chosen**. Fallback option C is Streamlit or
  Dash, used only if Checkpoint A fails.
- **Container contract** ([deploy/cloudrun/README.md](../deploy/cloudrun/README.md)): serve on `$PORT`, stateless,
  read data read-only, start under ~10 s, ≤ 1 GiB RAM, `/healthz` returns 200, no secrets, no `.env`.
- **Data contract:** [docs/data-dictionary.md](data-dictionary.md). The dashboard reads `calendar/v1`. Dashboard
  builds against the mock calendar (`astro-fire mock-calendar`, synthetic numbers, same columns) until Checkpoint B.

**Dashboard spec highlights** ([docs/spec/dashboard.md](spec/dashboard.md)):

- Must: area selection (draw a rectangle or enter lat/lon bounds); date range; burning calendar (year × month
  heatmap, colorblind-safe ramp, legend); estimated months marked; this month vs median (flag partial months);
  map of L2 cells; CSV of native hotspots; "how to read / limitations / sources" panel; loading, empty and error
  states; English; public Cloud Run URL with no login.
- Should (before Sun 15:00): raw vs harmonized toggle and trend (shows the 2012 step disappearing); uncertainty
  bands; day/night toggle; anomaly mode; seasonal profile; chart downloads; free polygon.
- Stretch (only after Checkpoint C): AGGS drill-down to L3; priority index; biome or municipality filters.
- Not building: image upload, fire-spread inference, prediction or alerts.
- Acceptance: changing area or period updates every view; a new user finds the peak month in under two minutes;
  the demo runs from the public URL in a private window; a local fallback exists with screenshots in
  `artifacts/screenshots/`.

## 7. Cloud (Google Cloud primary, local fallback)

ADR: [docs/decisions/0004-gcp-primary-local-fallback.md](decisions/0004-gcp-primary-local-fallback.md). Owner: Kali.

- Project `astro-boys`, region `us-central1`, zone `us-central1-a`. Budget alert BRL 250/month.
- Private bucket with public access prevention and a 14-day cleanup for `astro/interim/`. Bucket name is in
  [docs/cloud/README.md](cloud/README.md#live-status-2026-11-14).
- Pipeline VM `astro-pipeline-vm` (16 GB): bootstrapped, smoke-tested, **stopped**. Auto-stops after 30 idle minutes.
- Artifact Registry repo `astro` (empty). Cloud Run enabled, **no service deployed yet**.
- No service-account keys, ever. Local access uses `gcloud auth application-default login`.
- **Every infra script is a dry run unless `APPLY=1`.** Nobody creates, changes or deletes Google Cloud resources or
  IAM without Kali.
- Runbooks: [docs/cloud/](cloud/README.md) (storage layout, VM, IAM, budget, fallback and rollback).

## 8. Team and roles

Owners were confirmed on Sat 2026-11-14. The task owner decides the specifics and logs them as a `DECISION`.

| Person | Team | Role | Backup |
|--------|------|------|--------|
| Mateus | Harmonization | Pipeline and cloud: ingest, aggregate, harmonize, export, VM runs; data contract | Kali |
| Justino | Harmonization | Data and QA: provenance, QA report, 2026 API pull, credits, methodology text | Mateus |
| Kali | Harmonization | Method and validation; project owner for Google Cloud and scope; final say on scope; submission and AI-use statement | Justino |
| Guilherme | Dashboard | Map and area selection; backend and deploy (with Cleber) | Cleber |
| Cleber | Dashboard | Calendar and charts; backend and deploy (with Guilherme) | Guilherme |
| Jean | Floater | Diary keeper; helps wherever a task is late; proposed demo lead, UI text, screenshots | |

Hand-off: the teams meet at the data contract. Jean's diary is the team's log.

## 9. Schedule and checkpoints (Brasília time)

Full detail: [docs/timeline.md](timeline.md). Checkpoints are reviewed with the team.

| Time | Checkpoint | Must be true |
|------|-----------|--------------|
| Sat 18:30–19:30 | Lock-in | Open decisions answered (defaults apply if not); data contract v1 frozen; stack chosen |
| Sat 19:30 | Mock delivered | Mock calendar is in the dashboard's hands ✅ |
| **Sat 23:00** | **A** | Northeast counts table exists (`cell_month_counts`); app shows a calendar locally |
| **Sun 02:00** | **B** | `calendar/v1` in the bucket; app reads real data locally |
| Sun 09:00 | | First Cloud Run deploy |
| **Sun 11:00** | **C** | Public URL with real data and validation table; stretch go/no-go |
| **Sun 15:00** | **Feature freeze** | Only fixes, reliability, docs and demo from here |
| Sun 15:00–19:00 | | Reproducibility run, methodology, credits, AI-use text, final deploy, offline fallback, screenshots |
| Sun 19:00–22:00 | | Project page text (English); demo (≤ 30 s or ≤ 7 slides) |
| Sun 22:00 | | Final check against official requirements |
| **Sun 22:30** | **Submitted** | Confirmation saved |

Cut rules (decide on the spot, log it):

- **A fails (no counts table):** cut to one state and fewer years; if the VM is the problem, run the Brazil CSVs
  locally. **A fails (app shows nothing):** switch to option C now.
- **B fails (no `calendar/v1`):** ship the month × day/night ratio (no cell term) as v1.
- **C fails (not deployed):** deploy whatever runs; if Cloud Run fails, record the demo from the local container.
- **Method loses to baselines:** ship the best baseline and say so; no stretch work.
- **Freeze:** anything unfinished is cut.

Stretch work only after a "go" at Checkpoint C.

## 10. Repository

```text
src/astro_fire/          pipeline package (config, storage, manifests, calibration, mock, smoke, CLI `astro-fire`)
tests/                   pytest; tests/fixtures holds tiny real FIRMS samples
scripts/                 log.sh, firms_download.py, sync_data.sh, check_repo_hygiene.sh
infra/gcp/               Google Cloud setup scripts (dry run unless APPLY=1) and VM bootstrap
deploy/cloudrun/         dashboard deploy contract, deploy.sh, rollback
app/                     dashboard app: main.py (FastAPI), static/, Dockerfile, requirements.txt
notebooks/               exploration
data/                    local mirror of the bucket (git-ignored, never committed)
artifacts/               small curated figures and metrics for the demo (committed)
presentation/            script, slides, final media
docs/                    all project documentation (this file lives here)
```

**Commands** (run `make help`):

| Command | Does |
|---------|------|
| `make setup` | Locked environment (`uv sync --group dev`) |
| `make test` | pytest |
| `make lint` | ruff on `src tests scripts` |
| `make check` | repo hygiene: no secrets, `.env`, credentials or data files |
| `make smoke` | CSV → DuckDB → partitioned Parquet → manifest, on sample rows |
| `make ci` | everything CI runs: lint, test, check, smoke. Must pass before every push |
| `uv run astro-fire mock-calendar` | Writes the synthetic calendar to `data/processed/calendar/mock/` |

**Workflow rules** ([AGENTS.md](../AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md)):

- Branches: `feat/<thing>`, `fix/<thing>`, `docs/<thing>`, `data/<thing>`. **No direct pushes to `main`.** Open a PR.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `data:`, `chore:`).
- Never commit secrets, `.env` or data files. The FIRMS MAP_KEY lives only in `.env`.
- Add dependencies with `uv add`; commit `uv.lock`.
- Every pipeline run writes a manifest to `manifests/`.
- **Diary:** log every decision, finished task, blocker, idea, meeting and note with
  `./scripts/log.sh <type> "<summary>" "<details>"`. Entries are UTC, append-only, one file per UTC day in
  `docs/diary/`. Big decisions also get an ADR in `docs/decisions/`.
- Anything taken from outside the team (code, text, images, numbers) is listed in [docs/resources.md](resources.md).
  We do not copy other teams' solutions.

## 11. Current status (snapshot 2026-11-14)

From [docs/tasks.md](tasks.md) on `main`, with the current branch noted:

| Area | Status |
|------|--------|
| Lock-in | L5 done (all six on the same Local Event). L2 in progress (framework unnamed). L1, L3, L4, L6 open |
| H1 mock calendar | ✅ Delivered by Kali (synthetic numbers) |
| H5 calibration prototype | ✅ On synthetic data, reproduces the worked example. Real run waits for H4 |
| H2 ingest, H3 QA, H4 aggregate | ⬜ Not done. Blocks Checkpoint A |
| H6–H13 (calibrate, harmonize, validate, intervals, docs) | ⬜ Not started |
| Dashboard D1 skeleton | 🔄 On `feat/app-skeleton` (local, not yet pushed): FastAPI `/healthz`, placeholder page, Dockerfile. Frontend framework not chosen |
| D2–D12 | ⬜ Not started |
| Cloud setup C0–C10 | ✅ Done |
| C11 Cloud Run deploy | ⛔ Waiting for a runnable container; D1 now provides one locally, deploy needs Kali's approval |
| Submission S1–S6 | ⬜ Not started (due Sun) |

Recent diary entries: `docs/diary/2026-11-14.md`. Dashboard D1 decisions logged there: the SPA framework stays open
(Guilherme's call); the dashboard test lives in `tests/` and `pyproject.toml` adds `pythonpath = ["app"]`.

## 12. Open decisions

Rule: the owner decides specifics within the guardrails and the data contract, then logs a `DECISION`. Defaults apply
until then.

| # | Decision | Status |
|---|----------|--------|
| Q1 | Dashboard stack | ✅ FastAPI + SPA. **Frontend framework (Angular or React) still open**, Guilherme and Cleber |
| Q2 | Grid | Default: AGGS 4×4 degree grid. H3 res 5 is the alternative. Mateus with Guilherme |
| Q3 | Direction | Default: MODIS → VIIRS-equivalent, S-NPP scale. Kali |
| Q4 | Method and years | Default: F + B with pooling; calibrate 2012–2019; test 2020–2021; OLS as baseline. Kali |
| Q5 | Primary metric | Default: hotspot count; active days secondary. Kali |
| Q6 | Extent | ✅ Northeast Brazil only |
| Q7 | Start of series | Default: 2003 in MVP; Terra-only 2000-11 → 2002-06 as should-have. Kali |
| Q8 | AGGS scope | Default: grid now; drill-down and priority index are stretch. Guilherme |
| Q9 | Prediction | ✅ Out |
| Q10 | Names on tasks | ✅ Confirmed. Demo lead and video-vs-slides still to confirm |
| Q11 | FIRMS MAP_KEY | ✅ Obtained; stored in `.env` only. Justino |
| Q12 | Local Event | ✅ All six registered. Judging time to check with Local Lead |
| Q13 | Outside material | ✅ None used so far; later additions go in `docs/resources.md` |

Other open items:

- Checkpoint C time: `timeline.md` says Sun 11:00; `tasks.md` puts "must-haves live" at Sun 15:00. Align with the team.
- Demo lead and video-vs-slides format (Jean proposed).
- Second reviewer from the other team (S5).

## 13. Risks (top items)

Full table: [docs/risks.md](risks.md). Review at each checkpoint; log a `BLOCKER` when one fires.

- **No working app at the deadline:** no calendar on screen by Sat 23:00 → one container, Jean helps, fall back to option C.
- **No harmonized data in time:** no `calendar/v1` by Sun 02:00 → ship the ratio-only v1.
- **Method does not beat baselines:** validation table at Sun 10:00 → ship the best baseline and say so.
- **False step where satellites change:** jump at 2012, 2018 or 2026-11 → one satellite per period, continuity factor, chart it.
- **Overclaiming wording** ("fires", "risk", "prediction") in UI or pitch → guardrail wording, limitations panel.
- **Cloud Run deploy fails or URL needs login** → roll back; run the container locally and record the demo.
- **Cloud overspend** → budget alert; VM auto-stop; Cloud Run max 3 instances.
- **AI-use and originality rules** → AI-use statement, acknowledgments, references list, no copying.
- **Deadline:** anything unfinished at Sun 19:00 is cut; freeze at Sun 15:00; submit by 22:30.
- **Exhaustion:** planned rest Sun 02:00–07:00; pair on risky changes.

## 14. Resources and AI use

- Data: NASA FIRMS (MODIS, VIIRS active fire). Citation text and disclaimer link are in `docs/resources.md` and the
  `AttributesReadme.txt` inside every zip. NASA does not endorse the project; do not use NASA logos.
- Tools: DuckDB, uv, Python 3.12, gcsfs, pytest, Ruff, gitleaks, Google Cloud, GitHub Actions, FastAPI, uvicorn,
  Docker. Full list with licenses: [docs/resources.md](resources.md).
- **AI use must be recorded** in `docs/resources.md#ai-usage` as it happens, and acknowledged in the submission.
  Recorded so far in this repo: AI-generated dashboard skeleton (`app/`), its test, the app README, and this file.

## 15. Glossary

- **Hotspot:** a pixel flagged as a thermal anomaly by FIRMS. Not a fire.
- **F (factor):** per cell, month and day/night, the expected VIIRS count per Aqua detection.
- **B (background):** expected VIIRS count in months when Aqua detects nothing.
- **R, B_reg:** regional ratio and regional background, used as pooling targets.
- **K, M:** pooling weights, chosen by cross-validation.
- **VIIRS-equivalent:** counts on the S-NPP scale, including estimates for MODIS-only years.
- **L1 / L2 / L3:** grid levels of 1°, 0.25° and 0.0625°.
- **AGGS:** the adaptive grid system the team's grid follows.
- **SP / NRT:** FIRMS standard processing vs near-real-time data.
- **Checkpoint A/B/C:** the three sync points (Sat 23:00, Sun 02:00, Sun 11:00).
- **Freeze:** Sun 15:00, after which only fixes go in.

## Sources

Everything above is taken from these files on `main` (plus `app/` on `feat/app-skeleton`):

- [AGENTS.md](../AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md), [README.md](../README.md)
- [docs/project-plan.md](project-plan.md), [docs/timeline.md](timeline.md), [docs/tasks.md](tasks.md),
  [docs/team.md](team.md), [docs/risks.md](risks.md)
- [docs/spec/harmonization.md](spec/harmonization.md), [docs/spec/dashboard.md](spec/dashboard.md),
  [docs/data-dictionary.md](data-dictionary.md), [docs/tool-usage.md](tool-usage.md), [docs/resources.md](resources.md)
- [docs/challenge/brief.md](challenge/brief.md), [docs/challenge/official-requirements.md](challenge/official-requirements.md)
- [docs/decisions/](decisions/) (ADRs 0001–0005), [docs/cloud/](cloud/README.md), [deploy/cloudrun/README.md](../deploy/cloudrun/README.md)
- [app/README.md](../app/README.md), [Makefile](../Makefile), [pyproject.toml](../pyproject.toml)
