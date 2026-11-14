# Project plan (v2)

**Status: LOCKED IN on Sat Nov 14 (roles, stack, pilot region).** Remaining specifics are decided by each
task's owner and logged; the defaults in [open decisions](#open-decisions) apply until then.

Supersedes plan v1. Built from the team's six research documents ([ADR 0005](decisions/0005-plan-v2.md)).
Specs: [harmonization](spec/harmonization.md) · [dashboard](spec/dashboard.md) · [data contract](data-dictionary.md).
Schedule: [timeline.md](timeline.md) · Who does what: [tasks.md](tasks.md) · Tools: [tool-usage.md](tool-usage.md).

**Challenge:** [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/) ([our summary](challenge/brief.md)).
**Deadline:** Sun Nov 15, 23:59 local. We submit by 22:30.

## The problem, in one paragraph

Satellites have recorded fire hotspots since 2000, but the record is split. From 2000 to 2011 there is only MODIS
(1 km pixels); from 2012 there is also VIIRS (375 m), which sees several times more hotspots, especially small
and night-time fires. Joining the raw counts creates a false jump in 2012, so managers can't tell real change in
fire activity from a change of instrument. MODIS is near the end of its life and VIIRS S-NPP stopped observing
on Nov 2, 2026, so a consistent baseline is needed now.

Analogy for the pitch: counting traffic for 25 years with an old blurry camera that only saw trucks, then a
high-definition one that also sees motorbikes. The numbers rise because the camera got better.

## What we deliver

1. **A harmonized hotspot dataset**: monthly VIIRS-equivalent counts per 0.25° cell for Northeast Brazil, early 2000s → today, with
   origin labels and uncertainty, validated on years the model never saw.
2. **A web app** (public URL): pick an area and period → burning calendar (year × month), this month vs the
   historical median, anomalies, raw vs harmonized comparison, CSV download.
3. **Evidence**: a validation table against simple baselines and the before/after-2012 chart.
4. **Submission**: project page in English, 30-second video or 7 slides, public repo, AI-use statement.

## How it works

```text
FIRMS yearly zips (MODIS Terra/Aqua, VIIRS S-NPP, NOAA-20) + FIRMS API (2026)
   │  ingest: extract countries, normalize, QA, grid cells                 [VM / local, DuckDB]
   ▼
hotspots (native, Parquet) ──────────────────────────────► CSV download, L3 drill-down
   │  aggregate: cell × month × day/night × satellite
   ▼
cell_month_counts
   │  calibrate on 2012–2019 (Aqua × S-NPP): factor F, background B, pooled toward the region
   │  validate on 2020–2021 against baselines (global ratio, OLS, month-only)
   ▼
calendar/v1: VIIRS-equivalent series + interval + origin + anomalies ──► Cloud Storage
   ▼
Web app on Cloud Run: map · calendar · median comparison · trends · downloads
```

Method in one sentence: for each place and month, we measure in the years both satellites flew together how
much more VIIRS sees than MODIS, and how much small fire VIIRS sees where MODIS sees nothing; where data is
thin we lean on the regional average in proportion to the evidence; then we rebuild the MODIS-only years in the
VIIRS scale, with an error margin, and check it by predicting years the model didn't see.

## Scope

| Tier | Harmonization | Dashboard |
|------|---------------|-----------|
| **Must** (by Sun 11:00) | **Northeast Brazil (pilot)**; 2003 → 2025; L2 monthly counts; F + B harmonization; `calendar/v1`; validation table with baselines; before/after chart | Area + date selection; calendar heatmap with estimated months marked; this month vs median; map; CSV download; limitations panel; deployed on Cloud Run |
| **Should** (by Sun 15:00) | Bootstrap intervals; 2026 via API with partial-month handling; anomalies (robust z); NOAA-20 continuity factor; Terra-only 2000-11 → 2002-06; sensitivity to confidence filter | Raw vs harmonized toggle and trend; uncertainty display; day/night toggle; anomaly mode; seasonal profile; chart downloads |
| **Stretch** (only after Checkpoint C) | All of Brazil, then more countries; matched-event sample (Aqua × NOAA-20, ±5 min) as a validation appendix; FRP-equivalent; comparison with INPE BDQueimadas | AGGS drill-down (L3, neighbors); AGGS priority index; biome / municipality filters |
| **Out** | Prediction or early warning; weather data; Level 3 fire masks; synthetic VIIRS points | Image upload; fire-spread inference |

Where the team's proposals landed:

| Proposal | In plan v2 as |
|----------|---------------|
| Poisson ratio with shrinkage + background term | The harmonization method |
| OLS transfer function | Baseline in the validation table; the VIIRS → MODIS direction is a display option |
| Belize 2020 audit (event-level matching, per-event models) | Its filters, guardrails, origin labels and "no fixed multiplier" finding are adopted; event matching itself is stretch |
| Platform-wise active-cell metric, median anomalies, partial months | `n_active_days` as secondary metric; anomaly and partial-month rules adopted |
| AGGS adaptive 4×4 grid | The grid of the whole system (L1/L2/L3 IDs); drill-down and priority index are stretch |

## Scientific guardrails

For everyone, including AI coding agents:

- MODIS and VIIRS are different instruments. Never treat raw counts as equivalent; never use a single fixed multiplier.
- Never sum satellites raw (Terra + Aqua, S-NPP + NOAA-20) into one series.
- Never compare brightness temperatures or confidence values across sensors.
- A detection is not a fire, not a fire count, not burned area. Say "hotspots" or "fire activity".
- Estimates are per cell and month. No synthetic VIIRS points; nothing finer than L2 for estimates.
- Every value keeps its origin; every estimate has an interval; estimated months are marked in the UI.
- Calibration and test years never mix. The method must beat simple baselines out of sample, or we ship the baseline.
- No missing value becomes a zero. No detection ≠ no fire.
- Index and z-score thresholds are product choices, never presented as NASA thresholds or probabilities.
- Numbers quoted from elsewhere (other teams, blogs) are hypotheses until we reproduce them or cite a primary source.

## Definition of done

- [ ] Public URL opens in a private window and answers: which months burn most here, and how does this month compare?
- [ ] The harmonized series shows no artificial step at 2012; the raw toggle shows the step.
- [ ] Validation table: final method vs baselines on 2020–2021, in the app and the repo.
- [ ] Estimated months are labeled, with intervals.
- [ ] Pipeline reproducible from the repo: commands, manifests, checksums of raw inputs.
- [ ] Limitations visible in the app and the project page.
- [ ] Sources, tools and credits in [resources.md](resources.md); NASA FIRMS cited with its disclaimer link.
- [ ] AI use described in the submission; AI-generated code and data acknowledged; watermarks on AI images.
- [ ] Everything linked from the submission is in English.
- [ ] Demo is ≤ 30 s video (English subtitles) or ≤ 7 slides.
- [ ] Offline fallback: container runs locally from `data/`; screenshots saved.
- [ ] Submitted by Sun 22:30; confirmation saved.

## Pitch outline

1. **Problem:** 25 years of fire records, two incompatible instruments, a false jump in 2012.
2. **Method:** per place and month, learn the MODIS → VIIRS relation where both exist; pool with the region
   where data is thin; rebuild the past with error margins.
3. **Proof:** predicted unseen years; beat the simple baselines; the 2012 step is gone.
4. **Product:** pick any area, see its burning calendar and how this month compares with history; download the data.
5. **Honesty:** estimates are labeled, uncertainty is shown, limits are stated.
6. **Why now:** S-NPP just ended; MODIS is next. The baseline has to be in the VIIRS scale.

## Open decisions

**Rule (team, Sat Nov 14): the owner of a task decides its specifics**, within the guardrails and the data
contract, and logs the choice as a `DECISION`. Defaults apply until the owner says otherwise.

| # | Decision | Status | Owner |
|---|----------|--------|-------|
| Q1 | Dashboard stack | ✅ **FastAPI backend + single-page frontend.** Frontend framework (Angular or React) still to name | Guilherme, Cleber |
| Q2 | Grid | Default: hierarchical 4×4 degree grid (1° / 0.25° / 0.0625°), AGGS IDs. H3 res 5 is the alternative | Mateus (pipeline) with Guilherme (map) |
| Q3 | Direction and reference | Default: MODIS → VIIRS-equivalent, S-NPP scale | Kali |
| Q4 | Method and years | Default: F + B with pooling; calibrate 2012–2019, test 2020–2021; OLS as baseline | Kali |
| Q5 | Primary metric | Default: hotspot count; active days as secondary | Kali |
| Q6 | Extent and demo region | ✅ **Northeast Brazil only, as the pilot.** Brazil-wide is stretch | Team |
| Q7 | Start of the series | Default: 2003 in the MVP (Aqua); Terra-only 2000-11 → 2002-06 as should-have | Kali |
| Q8 | AGGS scope | Default: grid now; drill-down and priority index are stretch | Guilherme |
| Q9 | Prediction / early warning | Default: out | Kali |
| Q10 | Names on tasks | ✅ Confirmed ([team.md](team.md)). Demo lead and video-vs-slides still to confirm | Team |
| Q11 | FIRMS MAP_KEY for 2026 data | ✅ Key obtained. Justino stores it in `.env` on the VM and locally; never in git or in docs | Justino |
| Q12 | Local Event registration (all 6, same event) and local judging time | To confirm | Kali |
| Q13 | Outside material (other teams' code, text, numbers) | ✅ None used. Anything added later goes in [resources.md](resources.md) | Everyone |

## Disclaimer

This prototype is exploratory. Hotspot detections and derived estimates carry uncertainty and must not be used on
their own for emergency, public-safety or resource-allocation decisions.
