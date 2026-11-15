# Data dictionary and data contract

Owner: Team Harmonization. **This is the contract with Team Dashboard.**
Status: **v1**. Contract owners: Mateus (pipeline) and Guilherme (backend). A change needs a diary `DECISION` and a heads-up to the other side.

Method behind the fields: [spec/harmonization.md](spec/harmonization.md). Storage: [storage-layout.md](storage-layout.md).

## Conventions

- Coordinates: WGS84 (EPSG:4326), decimal degrees.
- Times: UTC, ISO 8601. Local solar date columns say so (`date_local`).
- Missing values are null. Never a sentinel such as `-999`, never a silent zero.
- Parquet, ZSTD, Hive partitions (`key=value` folders). Dataset version folder = `ASTRO_DATASET_VERSION` (`v1`).
- Counts in `calendar` are **VIIRS-equivalent hotspot detections**, not fires and not burned area.

## Raw FIRMS fields (as delivered)

| Field | MODIS | VIIRS | Unit | Meaning |
|-------|-------|-------|------|---------|
| `latitude`, `longitude` | ✓ | ✓ | degrees | Center of the pixel flagged as fire / thermal anomaly |
| `brightness` | ✓ | | K | Brightness temperature, band 21/22 (~4 µm) |
| `bright_ti4` | | ✓ | K | Brightness temperature, band I4 (~3.7 µm); saturates near 367 K |
| `bright_t31` | ✓ | | K | Brightness temperature, band 31 (~11 µm) |
| `bright_ti5` | | ✓ | K | Brightness temperature, band I5 (~11.5 µm) |
| `scan`, `track` | ✓ | ✓ | km | Actual pixel size along scan and track (~1 km MODIS, ~0.375 km VIIRS at nadir) |
| `acq_date`, `acq_time` | ✓ | ✓ | UTC date, HHMM | Acquisition time |
| `satellite` | `Terra`, `Aqua` | `N` (S-NPP), `N20`, `N21` | | Platform |
| `instrument` | `MODIS` | `VIIRS` | | Sensor |
| `confidence` | 0–100 | `l`, `n`, `h` | | Detection confidence; **scales are not equivalent** |
| `version` | e.g. `6.03`, `61.03` | e.g. `2` | | Collection and processing; suffix `NRT`/`RT`/`URT` = near real time |
| `frp` | ✓ | ✓ | MW | Fire radiative power of the pixel |
| `daynight` | `D`/`N` | `D`/`N` | | Day or night overpass |
| `type` | ✓ | ✓ | | 0 vegetation fire · 1 volcano · 2 other static land source · 3 offshore |

Official definitions: https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs

## 1. `processed/calendar/v1/` — the dashboard's main table

One row per L2 cell × local year-month × period. Partitioned by `year`.

| Field | Type | Meaning |
|-------|------|---------|
| `cell_l2` | string | Grid cell ID, e.g. `G078141.06` ([grid](spec/harmonization.md#4-grid-aggs-compatible--q2)) |
| `cell_l1` | string | Parent 1° cell |
| `lat_min`, `lat_max`, `lon_min`, `lon_max` | double | Cell bounds |
| `year`, `month` | int | Local solar year and month |
| `period` | string | `D` day, `N` night, `ALL` (= D + N) |
| `count_harmonized` | double | VIIRS-equivalent hotspot count. Observed value from 2012-02, estimate before |
| `ci_low`, `ci_high` | double | 90% interval from measured out-of-year error ([how](methodology.md#uncertainty-of-the-estimates)). Equal to the value for observed months; null when the estimate is null |
| `var_harmonized` | double | Prediction variance of the estimate (0 if observed). For a sum of `n` cells use `Σ var × n^0.32`: errors of nearby cells are correlated (measured 2.4× for 16 cells, 13.7× for the whole extent) |
| `origin` | string | `VIIRS_OBSERVED` or `VIIRS_EQUIVALENT_FROM_MODIS` |
| `source_satellite` | string | `Aqua` (estimated months), `SNPP` (observed), `N20` (observed × continuity ratio: from 2026-11 and in S-NPP outage months) |
| `is_estimated` | bool | True when `origin` is an estimate. The UI must mark these months |
| `is_nrt` | bool | Built from near-real-time data (recent months) |
| `is_partial` | bool | The source satellite observed fewer than 90% of the days (outage, or the month is not over). For the unfinished current month, `median_hist` and the anomalies use the same days of earlier years |
| `days_observed` | int | Days of the month covered by the data |
| `raw_aqua`, `raw_terra`, `raw_snpp`, `raw_n20` | int, nullable | Native filtered counts per satellite; null when the satellite had no data yet |
| `frp_sum_mw_native` | double | FRP sum of the `source_satellite`, native scale (not harmonized) |
| `median_hist` | double | Median over all fully observed years 2003–2025 for this cell, month of year and period; a fully observed month with no row counts as 0 |
| `anomaly_abs`, `anomaly_pct` | double | `count − median`; percent is null when the median is 0 |
| `anomaly_z` | double | Robust z-score `anomaly_abs / (1.4826 × MAD)`; null when MAD is 0 or the month is partial. Noisy in sparse cells |
| `model_version` | string | Factor set and code version used |

Rules for consumers:

- Months with incomplete Aqua coverage keep their partial flag and a null estimate.
  Incomplete S-NPP months show the observed subset with `is_partial=true`.
  (The first H7 release left estimated intervals, variance and anomalies null; later releases fill them.)
- To get a region, **sum `count_harmonized` over its cells first**, then compute medians and anomalies on the sum.
  Do not average per-cell anomalies.
- **Variance and interval of a sum of cells.** The errors of nearby cells are correlated, so adding the variances as if
  the cells were independent makes the interval far too narrow (for the whole Northeast the real variance is about
  13.7 times the independent sum). Use `var_area = Σ var × n^0.32` and `spread = 1.645 × √var_area`, with `n` the
  number of cells that have an estimate in that month. With one cell `n^0.32 = 1`, so its own variance is used. The
  exponent 0.32 is empirical (see `var_harmonized` above). The UI must say that the interval of an area is approximate.
  Observed months have variance 0, so their interval equals the count.
- **A null estimate is not zero.** If `count_harmonized` is null in any cell of the month, the sum for that month has
  no value (`None`/null): a sum of the cells that have one would understate the month. Show it as "No estimate",
  never as 0 and never as a low value.
- **An unfinished month is compared with the same days of earlier years, never with full months.** Use
  `processed/month_to_date/v1`: for the area, sum `n_hotspots` over its cells for each earlier year (days 1..`days`),
  count a year with no row in the area as 0 (up to `n_years` values), and take the median and the MAD of those values.
  Compare the month so far with that median. Only an observed partial month that covers exactly `days` days of the
  layer's month qualifies (the same rule as `same_window` in `harmonize`).
- Never add `raw_*` columns of different satellites together.
- An absent row means no detection in that cell-month by the source satellite, **not** a confirmed absence of fire.

## 2. `processed/hotspots/v1/` — native detections

For the CSV download and the L3 drill-down. Partitioned by `instrument`, `year`.

| Field | Type | Meaning |
|-------|------|---------|
| `hotspot_id` | string | Stable row ID |
| `latitude`, `longitude` | double | As delivered |
| `acq_ts_utc` | timestamp | From `acq_date` + `acq_time` |
| `date_local`, `month` | date, int | Local solar date (UTC + longitude/15 h) |
| `satellite` | string | `Terra`, `Aqua`, `SNPP`, `N20`, `N21` |
| `instrument` | string | `MODIS`, `VIIRS` |
| `daynight` | string | `D`, `N` |
| `confidence_raw` | string | As delivered |
| `confidence_class` | string | `l`, `n`, `h` (filter helper only) |
| `frp_mw` | double | As delivered |
| `brightness_mir_k`, `brightness_tir_k` | double | Hot and reference band of **that** sensor; never compare across sensors |
| `delta_t_k` | double | `mir − tir`, diagnostic |
| `scan_km`, `track_km` | double | As delivered |
| `type` | int, nullable | As delivered. Null when FIRMS NRT provides no type |
| `version` | string | As delivered |
| `passes_main_filter` | bool | Nominal/high confidence and `type == 0`. Untyped 2026 API NRT detections also pass for provisional counts |
| `cell_l1`, `cell_l2`, `cell_l3` | string | Grid cells |
| `country` | string | From the source file name |
| `source_file` | string | Raw file the row came from |

## 3. `processed/cell_month_counts/v1/`

Per `cell_l2 × year × month × daynight × satellite`: `n_hotspots`, `n_active_days`, `frp_sum_mw`, `n_all_confidence`.

## 4. `processed/factors/v1/`

Per `cell_l2 × month × period`: `f`, `b`, `sum_aqua_pos`, `sum_viirs_pos`, `n_zero`, `sum_viirs_zero`, `r_region`,
`b_region`, `k`, `m`, `weight_cell`, `calibration_years`, `model_version`, `r_parent`, `b_parent`, `pool_level`.
Lets anyone recompute an estimate by hand: `f = (sum_viirs_pos + k·r_parent) / (sum_aqua_pos + k)` and
`b = (sum_viirs_zero + m·b_parent) / (n_zero + m)`. `r_parent`/`b_parent` are the values the cell was pooled
toward (`pool_level`: `l1` = its 1° parent cell, `region` = the whole extent). To convert: `f × Aqua` when
Aqua > 0, otherwise `b`; a cell with no row uses `r_region × Aqua` and gets no background.

Terra-aware background: `b_witness1` (Terra recorded something in that cell, month and period) and
`b_witness0` (it did not), with `n_zero_witness*`, `sum_viirs_zero_witness*`, `b_parent_witness*`, `m_witness`
and `witness_satellite` for the same hand calculation. When Aqua = 0: use `b_witness1` if Terra > 0,
`b_witness0` if Terra = 0, and `b` if Terra is unknown that month (see `coverage_monthly`) or the witness
columns are null.

Reconciliation: `r_total` (all S-NPP over all Aqua for that month and period in the calibration years),
`reconcile_lambda` and `reconcile_min_regional_aqua`. After the cell estimates, each year, month and period
is multiplied by `(1 − λ) + λ × (regional Aqua × r_total) / Σ cell estimates`, unless regional Aqua is below
the minimum. **The sums run over the whole extent, so estimates must be computed for all cells at once.**

**Do not reimplement any of this: call `astro_fire.calibration.build_source` and `apply_factors`** on the
whole extent. `apply_factors` returns `estimate` (final) and `estimate_unreconciled`.

## 4b. `processed/uncertainty/v1/`

Per `regime` (`aqua_positive`, `aqua_zero`) × `period` (`D`, `N`, `ALL`) × `bin` (floor of log2 of the estimate,
−4 to 9): `n_rows`, `bin_used`, `n_rows_used`, `variance_ratio`, `q05_ratio`, `q95_ratio`. Written by `calibrate`,
read by `harmonize`: `ci_low = estimate × q05_ratio`, `ci_high = estimate × q95_ratio` (never excluding the
estimate), `var = estimate × variance_ratio`.

## 5. `processed/coverage_daily/v1/` and `processed/coverage_monthly/v1/`

Which days and months each satellite was observing, from `uv run astro-fire coverage`
([rule](methodology.md#observation-gaps)).

| Table | Field | Type | Meaning |
|-------|-------|------|---------|
| daily | `satellite`, `date_local` | string, date | One row per satellite and local day of the whole period |
| daily | `n_all` | int | Detections in the whole extent that day, all confidence classes and types |
| daily | `expected` | double | Detections implied by the other satellites that day; null when none was operating |
| daily | `status` | string | `ok`, `missing` (outage) or `not_operating` (before its first or after its last record) |
| monthly | `satellite`, `year`, `month` | string, int, int | |
| monthly | `days_in_month`, `days_missing`, `days_not_operating`, `days_observed` | int | `days_observed` feeds `calendar.days_observed` |
| monthly | `coverage_fraction` | double | `days_observed / days_in_month` |
| monthly | `is_complete` | bool | At least 90% of the days observed. Days after the end of the data count as not observed. Incomplete months must not be read as low activity |
| monthly | `is_nrt` | bool | The month contains near-real-time detections |

## 5b. `processed/continuity/v1/` and `processed/month_to_date/v1/`

- `continuity`: `month`, `period`, `ratio` = S-NPP / NOAA-20 detections over months complete for both, 2018–2025.
  A NOAA-20 count times `ratio` is on the S-NPP scale.
- `month_to_date`: for the unfinished last month of the data, `cell_l2`, `year`, `month`, `period`, `days`,
  `n_hotspots` = filtered S-NPP detections on days 1..`days` of that month in each earlier year with full
  S-NPP coverage of those days; `n_years` = number of such years (a cell with no row in a year counts as 0).
  `harmonize` uses it so the partial month's `median_hist` and anomalies compare the same days.

## 6. Sample for app development

`uv run astro-fire export --sample` writes a small `calendar` extract with this schema (one L1 cell, all years),
committed under `app/` by the Dashboard team if they want fixtures (max 100 KB) or read from the bucket.
Until the real pipeline runs, a **mock with the same columns** lets the app be built in parallel:

```bash
uv run astro-fire mock-calendar                              # 144 cells (lon -47..-44, lat -11..-8), ~94k rows, 1 MB
uv run astro-fire mock-calendar --bbox=-48.8,-18.4,-34.7,-1.0   # whole pilot extent, ~2.6M rows, 16 MB
```

It writes `data/processed/calendar/mock/year=YYYY/*.parquet` (git-ignored) with exactly the columns of section 1,
2003-01 → 2026-11, the last month partial. Read it with
`read_parquet('data/processed/calendar/mock/**/*.parquet', hive_partitioning = true)`.

**The mock's numbers are synthetic** (a seeded formula, `model_version = 'MOCK'`). They are for building screens
only and must never appear in a figure, the demo or the submission. Switching to real data means pointing the
app at `processed/calendar/v1/` instead; the schema is the same.

## API shape (if the app has a backend)

Suggested, not mandatory; the functional contract is what matters ([spec/dashboard.md](spec/dashboard.md)).

```json
{
  "area": {"type": "bbox", "west": -47.0, "south": -11.0, "east": -44.0, "north": -8.0, "cells": 132},
  "period": "ALL",
  "baseline_years": [2003, 2025],
  "model_version": "v1",
  "months": [
    {
      "date": "2008-09", "year": 2008, "month": 9,
      "count_harmonized": 176.0, "ci_low": 151.2, "ci_high": 203.9,
      "origin": "VIIRS_EQUIVALENT_FROM_MODIS", "is_estimated": true, "is_partial": false,
      "raw": {"aqua": 51, "terra": 40, "snpp": null, "n20": null},
      "median_hist": 140.5, "anomaly_abs": 35.5, "anomaly_pct": 25.3, "anomaly_z": 0.9
    }
  ]
}
```

### `GET /api/hotspots/count` (task D6)

Asks how many native hotspots (NASA FIRMS detections, never "fires") the CSV of `GET /api/hotspots.csv` would hold,
before downloading. Same query as the CSV: `west`, `south`, `east`, `north`, `start`, `end` (local solar dates),
`period` (`ALL`, `D`, `N`), `include_all`.

| Field | Meaning |
|-------|---------|
| `rows` | Number of matching rows. **Exact only when `over_limit` is `false`.** When `over_limit` is `true` the scan stopped at `max_rows + 1`, so `rows` is `max_rows + 1`: a lower bound, never the real total, and it must not be shown as one |
| `over_limit` | `true` when more than `max_rows` rows match, so the CSV is refused (HTTP 413). Counting stops early, which is why a large range answers in a fraction of a second instead of reading every year |
| `max_rows` | Largest CSV, 500,000 rows by default (`ASTRO_CSV_MAX_ROWS`) |
| `cells` | 0.25 degree cells in the area |
| `start`, `end`, `period`, `include_all` | The query, echoed |

Years missing from a local copy answer 503, never `rows: 0`.
