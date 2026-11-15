# Data dictionary and data contract

Owner: Team Harmonization. **This is the contract with Team Dashboard.**
Status: **v1**. Contract owners: Mateus (pipeline) and Guilherme (backend). A change needs a diary `DECISION` and a heads-up to the other side.

Method behind the fields: [spec/harmonization.md](spec/harmonization.md). Storage: [cloud/storage-layout.md](cloud/storage-layout.md).

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
| `ci_low`, `ci_high` | double | 90% interval (bootstrap). Equal to the value for observed months |
| `var_harmonized` | double | Variance of the estimate (0 if observed); lets the app approximate intervals for summed areas |
| `origin` | string | `VIIRS_OBSERVED` or `VIIRS_EQUIVALENT_FROM_MODIS` |
| `source_satellite` | string | `SNPP`, `N20`, `Aqua`, `Terra` |
| `is_estimated` | bool | True when `origin` is an estimate. The UI must mark these months |
| `is_nrt` | bool | Built from near-real-time data (recent months) |
| `is_partial` | bool | Month not complete yet |
| `days_observed` | int | Days of the month covered by the data |
| `raw_aqua`, `raw_terra`, `raw_snpp`, `raw_n20` | int, nullable | Native filtered counts per satellite; null when the satellite had no data yet |
| `frp_sum_mw_native` | double | FRP sum of the `source_satellite`, native scale (not harmonized) |
| `median_hist` | double | Historical median for this cell, month of year and period (baseline window in the manifest) |
| `anomaly_abs`, `anomaly_pct` | double | `count − median`; percent is null when the median is 0 |
| `anomaly_z` | double | Robust z-score; null when MAD is 0 |
| `model_version` | string | Factor set and code version used |

Rules for consumers:

- To get a region, **sum `count_harmonized` over its cells first**, then compute medians and anomalies on the sum.
  Do not average per-cell anomalies. Variances add (independence approximation; note it in the UI).
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
| `type` | int | As delivered |
| `version` | string | As delivered |
| `passes_main_filter` | bool | `type == 0` and nominal/high confidence |
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
columns are null. **Do not reimplement this: call `astro_fire.calibration.build_source` and `apply_factors`.**

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
| monthly | `is_complete` | bool | At least 90% of the days observed. Incomplete months must not be read as low activity |

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
