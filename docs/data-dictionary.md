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

## 6b. Weather context (`GET /api/weather`, proof of concept)

A separate, optional layer: ERA5 temperature and wind for an area and one month, from the Open-Meteo Historical
Weather API (`models=era5`, never `best_match`). It is **context**. It never enters `calendar/v1`, the harmonization
model or any hotspot count, and it does not say that weather causes hotspots.

Request: `year`, `month`, `west`, `south`, `east`, `north`. Answer: `source`, `model`, the UTC days asked for
(`start`, `end`) and the days that have values (`available_from`, `available_through`, `days_available`,
`days_requested`), `status` (`ok`, `partial` when the latest days are not published yet, `unavailable`),
`points_in_area`, `points_used`, `temperature_mean_c`, `wind_speed_mean_kmh`, `wind_direction_from_deg`,
`wind_direction_from` and `wind_direction_steadiness`.

Rules:

- **Spatial match.** ERA5 points sit at multiples of 0.25°, which are the corners of four L2 cells, not cell centers.
  The area takes the ERA5 points inside the box, with no interpolation; a box too small for a point takes the nearest
  one. A large box is sampled on a regular grid of at most 36 points (the answer says how many were inside and how many
  were used). Ocean points are included: there is no land mask.
- **Time.** UTC days. ERA5 is published a few days late: days without values are left out of the means and reported in
  `days_available`; they are never filled and never counted as zero.
- **Means.** Temperature and wind speed are means of the daily means over the days and points that have values. The wind
  direction is where the wind blows **from**, taken from the mean wind vector (so opposite winds cancel);
  `wind_direction_steadiness` is the length of that mean vector over the mean speed (1 = always the same direction).
- **Terms.** Free use is non-commercial, fewer than 10,000 calls a day, with attribution (CC BY 4.0). The backend
  caches each (area, month) in memory: for ever once the month is more than 60 days old, six hours before that.

### Weather map layers (`GET /api/weather/grid`)

Same rules as above, for the map layers (temperature, wind speed, wind direction). Request: the same six parameters.
Answer: the same source and period fields, `status`, `step_deg` and `points`, one monthly mean per sampled ERA5 point
(`lat`, `lon`, `temperature_c`, `wind_speed_kmh`, `wind_from_deg`, `days_available`; `null` is "no value", never zero).

- **A sample, not a surface.** Points are a regular sub-grid of ERA5's own grid, as fine as 400 points allow (0.25, 0.5, 1
  or 2 degrees; 1 degree, 252 points, for the pilot area). They are drawn as points and arrows, never as filled cells, so
  the map does not claim a resolution it does not have. Requests go to Open-Meteo in chunks of 50 points and the whole
  answer is cached in memory for the same (area, month).
- **Scales.** Fixed classes for every month and area: temperature 20, 22, 24, 26, 28, 30 degrees C; wind speed 8, 12,
  16, 20, 24, 28 km/h. The ramp is the cool teal ramp (`--wx-seq-*`), apart from the warm magma ramp of the hotspots;
  `scripts/check_viz_ramp.py --theme weather` checks it. The two legends are never combined.
- **Arrows** point where the wind blows **toward** (the opposite of the meteorological "from"); the legend says so.

### Live wind and temperature (`GET /api/weather/live`)

The **temperature and the wind "now"**, for a **fixed, wide region** (longitude -75 to -25, latitude -33 to 6 on the
lattice, far beyond the study area), as a regular lattice of **3 degrees (238 points)**. It comes from the **Open-Meteo
Forecast API**, `current` block: the weather model's analysis of the present moment (the service's default "best match"
model), refreshed by the service every 15 minutes. It is **not** ERA5 (ERA5 is published days late, so it cannot show
"now") and **not** a station observation, and it has nothing to do with the hotspot data. The same answer feeds the
temperature surface, the wind streaks and the "Region weather" panel, so the three never disagree.

Answer: `source`, `region`, `step_deg`, `fetched_at` (when this server asked), `model_time` (the latest time the service
reported), `interval_seconds`, `ttl_seconds`, `stale`, `stale_reason` and `points` (`lat`, `lon`, `temperature_c`,
`wind_speed_kmh`, `wind_from_deg`, `gust_kmh`; `null` is "no value").

- **Shared, cached and persisted.** One answer for the whole server, kept **90 minutes**: a request inside that time costs
  nothing at the weather service. Every location of a request counts as one call (the free limits are fewer than 10,000
  calls a day and 600 a minute), so the server keeps a daily budget of **4,000 locations** (16 refreshes of 238). The last
  answer and the day's spending are also written to a small cache folder (`ASTRO_WEATHER_CACHE`, a temp folder by
  default), so a restart reuses a fresh answer instead of asking again. **Limit:** Cloud Run instances do not share that
  folder and it is memory on Cloud Run. A store every instance can read, and a scheduled refresh, need a bucket the
  service may write to and a scheduler, which are changes to the cloud project and need its owner (Kali).
- **Never a made-up answer.** If the service fails, or the budget is spent, the last good answer is served with
  `stale: true` and the reason; with no answer at all the endpoint is a 502. The browser never calls Open-Meteo, and
  nothing is requested per frame, zoom, hover or move: the animation only reads the field already in memory.
- **The surface** (`lib/thermalSurface.ts`) is the bilinear interpolation of the temperature samples, drawn once per answer
  as a classed image on the Web Mercator grid (fixed classes 12, 16, 20, 24, 28, 32 degrees C on the thermal ramp). It
  shows the regional pattern; between the points it is an interpolation, not an observation, and where a corner has no
  value the pixel stays transparent.
- **The animation** (client side, `lib/windField.ts`, `components/map/WindParticles.tsx`) interpolates the east and north
  components bilinearly between the points (`u = -s sin(from)`, `v = -s cos(from)`, where `from` is the direction the
  wind comes from) and moves streaks through that field. It shows the pattern of the current field, time-lapsed (6
  hours of flow per second), not the path of an air parcel; a spot where any of the four corners has no value is not
  drawn. Streaks are born inside the view and the density adapts to the frame time. With reduced motion the same points
  are static arrows.
- **Periods.** The overview shows the hotspots of the month picked in the calendar and the weather of **now**. When those
  are different months the page says so ("a different period from the hotspots"). The ERA5 month for a picked month is a
  later step.

### States and "Region weather" (`GET /api/regions/states`)

The 27 Brazilian states as GeoJSON from **IBGE** (`malhas` with `intrarregiao=UF`, and `localidades`): `code`, `uf`,
`name` and `region` on each feature, cached for a week with the last copy served if IBGE fails. A click on the map is
resolved on the client (point in polygon) to the state it falls in, and the "Region weather" panel answers with:

- **mean of the grid points inside the state**, equal weights, when there are two or more (the panel says how many);
- **one grid point inside the state** when there is only one: it is labelled a point value, never a mean;
- the **nearest grid point** (and how far it is) when none is inside, only if it is within 1.5 grid steps of the click;
- **no value** otherwise. No temperature is invented to fill a region.

The wind direction of an answer comes from the **mean wind vector** of the points (opposite winds cancel and no direction
is shown). With a 3-degree lattice a state has very few points (Ceará has one), so the panel is coarse by construction
and says so; for finer detail inside Ceará use the municipalities layer.

### Municipalities and feels-like temperature (`GET /api/municipalities/{uf}` and `.../weather`)

First version for **Ceará** (`uf = ce`; any other state is a 404). Two sources, kept apart:

- **Boundaries and names: IBGE** (`malhas` and `localidades` APIs, no key). GeoJSON of the 184 municipalities with `code`
  (IBGE code), `name` and the centroid (`lon`, `lat`) on each feature, plus the state's `bounds`. The minimum quality of
  the mesh is used. Cached for a week; if IBGE fails the last copy is served. IBGE answers in gzip whether or not it is
  asked to, and the client unpacks it.
- **Weather: Open-Meteo Forecast API, `current` block**, at the **centroid** of each municipality: `apparent_temperature_c`
  ("feels like"), `temperature_c`, `humidity_pct`, `wind_speed_kmh` (`null` is "no value", never zero), with `model_time`,
  `fetched_at`, `stale` and `stale_reason`. These are **model values, not station readings**, and the centroid is a point
  of the model grid, not the whole municipality.
- **Cost.** One request asks 184 locations, each counting as one call (free limit: fewer than 10,000 a day and 600 a
  minute, shared with the live field at up to 4,000 a day and the historical layers). The answer is shared and cached two
  hours, with its own budget of 2,200 locations a day (11 refreshes); at the budget, or on failure, the last good answer is
  served flagged `stale`, and with no answer at all the endpoint is a 502.
- **Colors.** Fixed classes of the feels-like temperature (22, 24, 26, 28, 30, 32 degrees C) on the cool weather ramp. They
  split the range and are not comfort or alert thresholds; no color means danger.

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
