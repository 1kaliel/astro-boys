# Spec: harmonization (Team Harmonization)

**Status: plan v2, locked in for roles and extent.** Choices marked ❓ are defaults that their task owner may
change with a diary `DECISION` ([open decisions](../project-plan.md#open-decisions)). Method owner: Kali. Pipeline owner: Mateus.

Consolidates the team's research: the Belize 2020 sensor audit, the transfer-function proposals (OLS and
Poisson ratio with shrinkage), the platform-wise activity metric, and the AGGS grid proposal.

## 1. What "harmonized" means here

One monthly series per grid cell, from the early 2000s to today, expressed in a single scale:
**VIIRS-equivalent hotspot counts** (one afternoon/night-orbit VIIRS 375 m satellite). A change in the curve should
mean a change in fire activity, not a change of satellite.

- **Direction: MODIS → VIIRS-equivalent.** The future record is VIIRS-only, new data arrives already in the
  target scale, and small fires stay visible. (The reverse, VIIRS → MODIS scale, is kept as a display option.)
- **We estimate counts per cell and month. We never create synthetic VIIRS points.** Native hotspots stay
  available, untouched, for audit and CSV download.
- Every value says where it came from: `MODIS_NATIVE`, `VIIRS_OBSERVED`, `VIIRS_EQUIVALENT_FROM_MODIS`.
- Every estimate carries an uncertainty interval.

## 2. Inputs

| Source | Satellite | Years | Role |
|--------|-----------|-------|------|
| `modis_{YYYY}_all_countries.zip` | Aqua | 2002-07 → 2025 | Calibration input; source of the 2002–2011 estimates |
| | Terra | 2000-11 → 2025 | Only source for 2000-11 → 2002-06 (❓ Q7); diagnostic afterwards |
| `viirs-snpp_{YYYY}_all_countries.zip` | S-NPP | 2012 → 2025 | **Reference scale**; observed series 2012 → 2026-10 |
| `viirs-jpss1_{YYYY}_all_countries.zip` | NOAA-20 | 2018 → 2025 | Continuity after S-NPP ended (2026-11-02); cross-check |
| FIRMS area API (`_SP`, `_NRT`) | S-NPP, NOAA-20 | 2026 | Current year and current month (needs MAP_KEY) |

Each zip holds one CSV per country at `{sensor}/{YYYY}/{sensor}_{YYYY}_{Country}.csv` (verified). The pipeline
extracts only the configured countries (`ASTRO_COUNTRIES=Brazil`) and clips to the pilot extent.

**Pilot extent: Northeast Brazil** (Maranhão, Piauí, Ceará, Rio Grande do Norte, Paraíba, Pernambuco, Alagoas,
Sergipe, Bahia). MVP clip: bounding box west −48.8, south −18.4, east −34.7, north −1.0 (approximate; it includes
slivers of neighboring states and ocean). State boundaries from IBGE are a should-have. The pooling "region" is
this extent. Brazil-wide processing is stretch: only the clip changes.

Known data facts to respect:

- `version` differs by year (e.g. `6.2` in 2000, `6.03` in 2020, `61.03` in 2024 for MODIS; `2` for VIIRS).
  Tabulate `version` by sensor and year in the QA report; values ending in `NRT`/`RT`/`URT` are near-real-time.
- MODIS `confidence` is 0–100; VIIRS is `l`/`n`/`h`. They are **not** equivalent scales (VIIRS `h` is tied to
  I4 saturation near 367 K).
- `brightness`/`bright_t31` (MODIS) and `bright_ti4`/`bright_ti5` (VIIRS) are different bands. Never convert or
  compare them across sensors.
- A row is a pixel center flagged as a thermal anomaly, not a fire. One fire can be one MODIS pixel and many
  VIIRS pixels.
- CSVs only contain detections. A missing row does not prove there was no fire (no coverage, cloud, below threshold).

## 3. Normalization

Raw files are never edited. The normalized table adds derived columns and keeps the originals.

| Step | Rule |
|------|------|
| Row ID | `hotspot_id` = stable hash of `source_file` + row number |
| Time | `acq_ts_utc` from `acq_date` + `acq_time` (HHMM, UTC) |
| Local solar date | `acq_ts_utc + longitude/15 hours` → `date_local`, `year`, `month`. Night detections land on the right local day |
| Satellite | `Terra`, `Aqua`, `SNPP` (FIRMS `N`), `N20`, `N21` |
| Confidence class | `confidence_class`: MODIS 0–29 `l`, 30–79 `n`, 80–100 `h`; VIIRS as given. Used for filtering only |
| Main filter | `passes_main_filter` = `type == 0` AND (MODIS `confidence >= 30` OR VIIRS `confidence in (n, h)`) |
| Clip | Keep rows inside the pilot extent; the same clip for every sensor |
| Grid | `cell_l1`, `cell_l2`, `cell_l3` (section 4) |
| Diagnostics | `delta_t_k` = hot band − reference band, per sensor. Diagnostic only, never a classifier |
| QA | Coordinates in range, valid timestamps, exact duplicates dropped and counted, `version` tabulated |

Sensitivity runs (should-have): all confidence classes; high only; with and without the `type` filter.

## 4. Grid (AGGS-compatible) ❓ Q2

A hierarchical 4×4 grid in WGS84 degrees. It is the same structure the AGGS proposal draws, it needs no extra
library in DuckDB or in the browser, and its levels double as the pooling hierarchy for the statistics.

| Level | Cell size | ≈ size at the equator | Children | Used for |
|-------|-----------|-----------------------|----------|----------|
| L1 | 1.0° | 111 km | 16 × L2 | Regional pooling, overview map |
| **L2** | **0.25°** | **28 km** | 16 × L3 | **Harmonization unit** (factors, calendar) |
| L3 | 0.0625° | 7 km | none | Drill-down of **native** detections only |

Cell IDs are hierarchical, as in AGGS (`G…`, `.NN`, `.NN`):

```sql
-- ix/iy count cells from (-180, -90). k = 1..16, rows from the south, columns from the west.
'G' || lpad(floor(lat + 90)::INT::VARCHAR, 3, '0') || lpad(floor(lon + 180)::INT::VARCHAR, 3, '0')  AS cell_l1,
cell_l1 || '.' || lpad((floor((lat + 90  - floor(lat + 90))  * 4)::INT * 4
                      + floor((lon + 180 - floor(lon + 180)) * 4)::INT + 1)::VARCHAR, 2, '0')        AS cell_l2
-- cell_l3: same rule applied inside the L2 cell.
```

- A parent ID is the child ID without its last `.NN`. Bounds are derivable from the ID alone.
- Cells are not equal-area (area shrinks with `cos(latitude)`). Sensor ratios inside a cell are unaffected; maps
  that compare cells must show counts per km² or say so.
- Harmonized values exist at L2 and coarser only. L3 shows native detections; we never claim sub-L2 precision
  for estimates.
- Alternative considered: H3 resolution 5 (equal-area hexagons, needs the H3 extension and `h3-js`).

## 5. Monthly counts

Per `cell_l2 × year × month × daynight × satellite`, from rows passing the main filter:

| Measure | Meaning |
|---------|---------|
| `n_hotspots` | Number of detections (**primary metric** ❓ Q5) |
| `n_active_days` | Local days with at least one detection (secondary, robust to pixel multiplicity) |
| `frp_sum_mw` | Sum of FRP, native, per satellite (not harmonized in the MVP) |

Never add satellites together before harmonizing. Terra + Aqua, or S-NPP + NOAA-20, summed raw creates false steps.

## 6. Transfer function: Aqua → VIIRS-equivalent

Same-overpass pair: **Aqua × S-NPP** (both ≈ 13:30 / 01:30 local). Keys: cell `c` (L2), month of year `m`,
period `p` (day / night). Calibration years: **2012–2019**; held-out test: **2020–2021** ❓ Q4.

```text
                    F(c,m,p) × Aqua     if Aqua > 0
VIIRS_equivalent =
                    B(c,m,p)            if Aqua = 0

F = (ΣV⁺ + K·R) / (ΣA⁺ + K)             B = (ΣV⁰ + M·B_reg) / (n⁰ + M)
```

| Symbol | Meaning (sums over calibration months for that key) |
|--------|------------------------------------------------------|
| ΣA⁺, ΣV⁺ | Aqua and S-NPP counts in months with Aqua > 0 |
| n⁰, ΣV⁰ | Number of months with Aqua = 0, and S-NPP counts in them (fire MODIS doesn't see) |
| R | Regional ratio ΣV⁺/ΣA⁺ for the same `m, p` (pooling level: parent L1 cell, else whole area) |
| B_reg | Regional background ΣV⁰/n⁰ for the same `m, p` |
| K, M | Pooling weights, chosen by leave-one-year-out cross-validation from {0, 2, 5, 10, 20, 50} |

Why this form:

- Counts are modeled as Poisson, `V ~ Poisson(F·A)`. The maximum-likelihood factor is the **ratio of sums**, not
  the mean of ratios: busy months weigh more and there is no division by zero.
- With little data a cell borrows from its region (`F → R`); with a lot, the cell's own ratio dominates.
- `F × 0 = 0` would erase small fires from the reconstructed past; `B` restores the expected background.
  `B` is not added when Aqua > 0, because `F` already includes simultaneous small fires.
- A single fixed multiplier is rejected: in the team's Belize 2020 audit the VIIRS/MODIS ratio was 4.05 by day and
  6.22 by night, with a daily interquartile range of 2.50–6.75.
- It is four sums per key, one `GROUP BY` in DuckDB, so it scales from one state to a continent.

### Implementation choices (method owner, Sat Nov 14)

Implemented in `src/astro_fire/calibration.py`; the worked example is reproduced in `tests/test_calibration.py`.

- **Calibration universe:** L2 cells with at least one filtered Aqua or S-NPP detection in the calibration
  years. Inside it, a cell-month with no row counts as zero detections. Cells outside it get no background
  estimate (nothing is invented over ocean or land that never showed activity); if Aqua detects there in the
  past, the regional ratio `R` is used.
- **January 2012 is left out** of calibration: S-NPP data starts on 2012-01-20, so that month is partial.
- **Pooling level:** a cell leans on its 1° parent cell (L1), whose own ratio leans on the whole extent with
  the same weight. Pooling straight to the whole extent is the alternative; the level is chosen with the
  weights. On the Northeast, 2012–2019, the parent level wins on every leave-one-year-out score.
- **`K` and `M` are chosen separately** (`K` only acts on months with Aqua > 0, `M` on months with Aqua = 0),
  each by the lowest leave-one-year-out **mean Poisson deviance** at cell-month level, from
  {0, 2, 5, 10, 20, 50, 100, 200}; ties go to more pooling. Absolute error is reported but not used to
  choose: for counts that are mostly zero it is minimized by predicting zero, so it picks `M = 0` and
  biases regional totals low. Without pooling (weight 0) the deviance is infinite.
- When the region has no Aqua detections at all for a month and period, there is no factor and the estimate
  is null, never zero.
- **Terra-aware background (owner decision, Sun Nov 15).** Zero-Aqua months are split by whether Terra
  recorded anything in the same cell, month and day/night period, and one background is fitted for each case
  (`b_witness1`, `b_witness0`) with the same pooling formula. Terra is a witness only: it is never added to
  Aqua and never decides which cells exist. When Terra is unknown for a month (outage, or before its
  record), the plain `b` applies. Kept because it lowers the out-of-year deviance on 2012–2019.
- **Reconciliation with the regional ratio (owner decision, Sun Nov 15).** After the cell estimates are
  computed, each month and day/night period is scaled by `(1 − λ) + λ × (regional Aqua × r_total) / Σ cell
  estimates`, with `r_total` the ratio of all S-NPP to all Aqua detections for that month of year and period
  in the calibration years. Not applied when the region has fewer than 30 Aqua detections. λ is chosen by
  out-of-year deviance on the calibration years and used only if it gains at least 0.5%. Consequence: the
  estimates of a month depend on the whole pilot extent, so they must always be computed for the whole
  extent, never for a subset of cells.
- **Observation gaps** come from `astro-fire coverage` (region-wide daily counts per satellite; rule in
  [methodology.md](../methodology.md#observation-gaps)). Months in which Aqua or S-NPP was not fully
  observing are left out of calibration and of the main validation scores; they are never read as zero.

### Series assembly

| Period | Value | `origin` |
|--------|-------|----------|
| 2012-02 → 2026-10, months with S-NPP fully observing | S-NPP observed | `VIIRS_OBSERVED` (`source_satellite = SNPP`) |
| 2026-11 →, and S-NPP outage months | NOAA-20 observed × continuity factor `C` | `VIIRS_OBSERVED` (`source_satellite = N20`) |
| 2002-07 → 2012-01 | `F × Aqua` or `B` (2002-07 and 2002-08 partial: Aqua outage) | `VIIRS_EQUIVALENT_FROM_MODIS` (`source_satellite = Aqua`) |
| 2000-11 → 2002-06 | **Not in the calendar.** A Terra-source factor set was fitted and passes forward validation, but the Terra–Aqua daytime relation was about half as large in the early 2000s, so it would be biased ([methodology.md](../methodology.md#extending-the-record-before-2003)) | — |

- **Continuity factor `C`:** ratio of sums S-NPP / NOAA-20 by month and day/night over 2018–2025. Expected close
  to 1; report it. If it is outside 0.9–1.1, show it in the limitations.
- 2026 months from near-real-time data are flagged `is_nrt`. The current month is flagged `is_partial`, with
  `days_observed`; comparisons use the same day-of-month window of earlier years.
- Day and night are harmonized separately; "all day" is their sum.

## 7. Validation

Chronological only. Calibration: 2012–2019. Development set: 2020–2021 (scored while the method was built,
so not a blind test). **Final test: 2022–2023, scored once with `astro-fire validate --final` after the
method is frozen**; 2024–2025 is reported with it, separately. The code enforces this split. The pass rule
is fixed before the final test is opened: see [methodology.md](../methodology.md#validation-protocol).

| Method compared on 2020–2021 (Aqua → S-NPP) | Role |
|---------------------------------------------|------|
| Raw Aqua counts | "No harmonization" reference |
| One global ratio | Baseline |
| OLS line `V = a·A + b`, global | Baseline (the team's first proposal) |
| Ratio by month × day/night, no cell term | Baseline |
| `F` with pooling | Candidate |
| `F` with pooling + background `B` | Candidate (expected final) |

- Metrics: MAE, RMSE, relative bias, correlation, at cell-month level and for regional monthly totals; split by
  day/night, by season, and by low/high activity.
- **Acceptance (as implemented):** `F + B` must have a lower MAE than every baseline both at cell-month
  level and for regional monthly totals. In short: the final method must beat the baselines out of sample. If it doesn't, we ship the simplest
  method that wins and say so.
- **Step test:** the raw series jumps at 2012; the harmonized one must not. This before/after chart is the main
  proof in the pitch.
- Check that the error does not grow with distance in time from the calibration years.
- Uncertainty: 90% intervals from measured out-of-year error on the calibration years, by regime, period
  and size of the estimate ([methodology.md](../methodology.md#uncertainty-of-the-estimates)). This replaced
  the bootstrap over calibration years first planned, which only captures factor uncertainty.

Out of sample we can only test where both sensors exist (2012+). Estimates for 2002–2011 assume the sensor
relation was stable; this is stated in the app.

## 8. Anomalies (computed on the harmonized series)

For a cell or any sum of cells, per month of year, over a fixed baseline window:

- Historical median `H`; absolute anomaly `obs − H`; percent anomaly only when `H > 0`.
- Robust z-score `(obs − median) / (1.4826 × MAD)`; flag when `|z| ≥ 2` (product threshold, not a NASA one).
- Partial current month: compare with the same days of earlier years.

The pipeline precomputes these at L2 and L1. For a user-drawn area the app sums cells first, then computes them.

## 9. Outputs

Schemas are the data contract in [../data-dictionary.md](../data-dictionary.md).

| Dataset | Content |
|---------|---------|
| `processed/hotspots/v1/` | Normalized native detections (for CSV download and L3 drill-down) |
| `processed/cell_month_counts/v1/` | Counts per cell, month, day/night, satellite |
| `processed/factors/v1/` | `F`, `B`, sums, `K`, `M`, per key |
| `processed/calendar/v1/` | **Harmonized monthly series: what the dashboard reads** |
| `artifacts/{run_id}/` | QA report, validation table, before/after chart, factor maps |
| `manifests/{run_id}.json` | Inputs with checksums, outputs, row counts, code version, parameters |

## 10. Pipeline commands (to build)

```bash
uv run astro-fire ingest     # zips → country CSVs → normalized hotspots Parquet + QA report
uv run astro-fire aggregate  # → cell_month_counts
uv run astro-fire ingest-api # FIRMS area-API files of the current year → hotspots and counts partitions (exists)
uv run astro-fire coverage   # → coverage_daily, coverage_monthly, month_to_date: outages, unfinished month (exists)
uv run astro-fire calibrate  # → factors (K, M by cross-validation), continuity factor
uv run astro-fire harmonize  # → calendar (+ bootstrap intervals, anomalies)
uv run astro-fire validate   # → validation table and charts
uv run astro-fire export     # → small bundle for the dashboard (and a sample for local dev)
```

Each command runs locally on a sample and on the VM on the full extent, and writes a manifest.

## 11. Acceptance criteria

- [ ] Someone else can run the pipeline from the repo instructions, locally on a sample and on the VM.
- [ ] Every processed row keeps sensor, satellite, product version and time reference.
- [ ] The same filters and clip are applied to every sensor.
- [ ] Factors come only from calibration years; test years are untouched until the final table.
- [ ] Validation table with baselines, plus the before/after-2012 chart, exist in `artifacts/`.
- [ ] Estimated months are labeled and carry an interval.
- [ ] Docs state: detection ≠ fire ≠ burned area; no cross-sensor temperature or confidence equivalence.
- [ ] `calendar/v1` feeds the dashboard with no hidden manual steps.

## 12. Not in the MVP (documented as future work)

- **Event-level matching** (Aqua × NOAA-20 within ±5 min, many-to-many graph, per-event count and FRP models).
  It is the right tool for per-event questions, but the calendar's unit is cell × month, and CSV-only data lacks
  the coverage, cloud and QA layers needed to model detection probability. Stretch: a small matched sample as a
  validation appendix.
- FRP-equivalent harmonization; Level 3 fire masks (`MOD14A1`, `VNP14A1`…); land-cover or view-angle covariates.
- Any prediction or early-warning model.

## 13. Limitations to state everywhere

- Estimates for the MODIS-only years cannot recover fires MODIS never saw; `B` is an average background, not
  observed fire.
- Terra and Aqua orbits have drifted in recent years (to verify in NASA notices); calibration stops in 2019 for
  that reason.
- CSV hotspots carry no "observed, no fire" information.
- The 2012–2019 sensor relation is assumed to hold for 2002–2011.
