# Methodology

Living document, owned by Team Harmonization. It feeds the project page's detailed description.

- **Planned method:** [spec/harmonization.md](spec/harmonization.md). This file records what was actually done
  and what came out, with links to the diary entries and to `artifacts/`.

## Study area and period

- Extent processed: _TBD_ (default Brazil) · Demo region: _TBD_
- Period: _TBD_ · Grid: L2 = 0.25° · Time unit: local solar month

## Data used

| Sensor / satellite | `version` values found | Period used | Rows in | Rows after the main filter |
|--------------------|------------------------|-------------|---------|----------------------------|
| MODIS Aqua | | | | |
| MODIS Terra | | | | |
| VIIRS S-NPP | | | | |
| VIIRS NOAA-20 | | | | |

## Results: transfer function Aqua → VIIRS-equivalent (Northeast Brazil)

Source: NASA FIRMS archive detections, MODIS Aqua and VIIRS S-NPP 375 m, clipped to the pilot bounding box,
`type = 0` (presumed vegetation fire), nominal and high confidence, gridded at 0.25° by local solar month.
Runs: ingest `20261114T235633Z_ingest_d60f88`, aggregate `20261115T001222Z_aggregate_aebb70`,
calibrate `20261115T004447Z_calibrate_d9bf4b`, validate `20261115T004449Z_validate_936196`. Reproduce with `uv run astro-fire calibrate` and
`uv run astro-fire validate`. Full tables: [artifacts/metrics/](../artifacts/metrics/).

### Calibration (2012–2019, January 2012 left out)

- 3,108 cells, 590,520 cell × month × day/night rows. S-NPP recorded 6.5 times as many detections as Aqua
  overall. The ratio is not one number: by day it runs from 2.5 (April) to 5.2 (October), by night from
  5.9 to 15.6.
- Aqua recorded nothing in 83% of the rows; in 23% of all rows S-NPP saw detections that Aqua did not.
- Chosen by leave-one-year-out Poisson deviance: pooling to the 1° parent cell, `K = 50`, `M = 5`.

### Validation on held-out years (2020–2021)

Each method predicts the S-NPP monthly count from Aqua alone. Unit: detections per cell and month
(149,376 rows, 3,112 cells); regional columns sum all cells, day + night, per month (24 months, mean observed
total 36,766).

| Method | Role | MAE, cell-month | RMSE, cell-month | Bias | Correlation | MAE, regional month | Bias, regional |
|---|---|---:|---:|---:|---:|---:|---:|
| Raw Aqua counts (no harmonization) | reference | 5.06 | 21.34 | -85.0% | 0.842 | 31250.6 | -85.0% |
| One global ratio | baseline | 4.08 | 14.86 | -2.2% | 0.842 | 3743.6 | -2.2% |
| OLS line V = a·A + b, global | baseline | 4.31 | 13.05 | +1.3% | 0.842 | 11530.1 | +1.3% |
| Ratio by month × day/night, no cell term | baseline | 3.73 | 13.01 | -2.1% | 0.877 | 3168.5 | -2.1% |
| F with pooling | candidate | 3.18 | 10.77 | -17.1% | 0.902 | 6304.5 | -17.1% |
| F with pooling + background B | candidate | 3.27 | 10.58 | +0.1% | 0.904 | 3252.4 | +0.1% |

What this shows, and what it does not:

- **Per cell, F + B is better than every baseline:** MAE 12% lower and RMSE 19% lower than the best baseline
  (ratio by month × day/night), and it is the least biased method (+0.1%).
- **For the whole region summed, it is a tie, and by the rule we set in advance it does not pass.** The rule
  was: lower MAE than every baseline at cell level *and* for regional monthly totals. On regional totals the
  month × day/night ratio has an MAE of 3,168 and F + B 3,252 (2.7% higher). The month-by-month difference
  averages +84 detections on a monthly total of about 36,800, with a 90% bootstrap interval of −821 to +870:
  the two cannot be told apart on 24 months. F + B is closer in 8 of the 24 months.
- Where it is behind at regional level: low-season months (MAE 1,496 vs 917) and night totals (bias +7.5%).
  Where it is ahead: fire-season months (MAE 6,764 vs 7,671).
- The background term matters: `F` alone (kept in the table to show this, not as a product option) is 17% low, because it leaves out every month in which
  Aqua saw nothing and S-NPP did.
- Removing the instrument effect is the large gain for every method: raw Aqua is 85% below S-NPP.

Described after the fact, not used to choose anything: summed to 1° cells per month (5,136 values), the MAE
is 36.2 for F + B against 46.0 for the best baseline.

### How these numbers were reached (two looks at the test years)

1. First run: weights chosen by leave-one-year-out absolute error, pooling to the whole extent
   (`K = 50`, `M = 0`). Test result: cell MAE 3.34, regional MAE 3,264, bias +1.0%.
2. The calibration years alone showed two problems: absolute error picked `M = 0` (no pooling of the
   background) and `K` sat at the edge of the grid. The selection score was changed to Poisson deviance, the
   grid was widened, and pooling to the 1° parent was added as a candidate. All three were decided on
   2012–2019 data.
3. Second run (the table above). The pass/fail rule itself was not changed.

### Known issue in the test data

August 2020 is the largest regional miss for every method (observed 41,325; best baseline 19,809; F + B
28,726). Aqua MODIS had a multi-day outage in the second half of August 2020 (to confirm against the NASA
notice and the daily counts in the QA report). An outage is a data gap, not low fire activity; the month was
kept in the test set as it is.

### Still to fill in

| Item | Status |
|------|--------|
| Bootstrap intervals for the estimates | Not done (H11) |
| NOAA-20 continuity factor after S-NPP ended | Not done (H11) |
| Before/after-2012 chart, raw vs harmonized | Not done (H8) |
| Sensitivity to the confidence filter; Terra-only 2000-11 → 2002-06 | Not done (H12) |

## Findings from the team's Belize 2020 audit (pilot, one country, one year)

MODIS (Terra + Aqua) 1,505 rows vs VIIRS NOAA-20 6,655 rows; overall ratio 4.42, 4.05 by day and 6.22 by night;
daily ratio interquartile range 2.50–6.75; April holds over half the detections. Median pixel footprint
1.43 km² (MODIS) vs 0.196 km² (VIIRS). 316 VIIRS rows at the I4 saturation limit (367 K). Within ±15 min and
5 km, every MODIS–VIIRS candidate pair involved Aqua, none Terra. These motivated: no fixed multiplier, separate
day/night, same-overpass pairs, per-sensor filters.

## Limitations

See [spec/harmonization.md](spec/harmonization.md#13-limitations-to-state-everywhere). Add what the results reveal.
