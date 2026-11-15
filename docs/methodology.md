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

Source: NASA FIRMS archive detections, MODIS Aqua and Terra, VIIRS S-NPP and NOAA-20 375 m, clipped to the pilot
bounding box, `type = 0` (presumed vegetation fire), nominal and high confidence, gridded at 0.25° by local
solar month. Runs: ingest `20261114T235633Z_ingest_d60f88`, aggregate `20261115T001222Z_aggregate_aebb70`,
coverage `20261115T010717Z_coverage_fa7b98`, calibrate `20261115T011427Z_calibrate_e00a2a`, validate `20261115T011432Z_validate_6c33d2`. Reproduce with `uv run astro-fire coverage`,
`calibrate` and `validate`. Full tables: [artifacts/metrics/](../artifacts/metrics/).

### Validation protocol

| Years | Role | Status |
|-------|------|--------|
| 2012–2019 | Calibration: factors, pooling level, weights, background type | Used |
| 2020–2021 | Development set: scored three times while the method was built | Used; **not a blind test** |
| 2022–2023 | **Final test**: scored once with `validate --final`, after the method is frozen | **Not opened yet** |
| 2024–2025 | Reported with the final test, separately (MODIS orbits drift in these years) | Not opened yet |

The code refuses to calibrate on any held-out year and refuses to score 2022–2025 without `--final`.
Yearly raw totals per satellite for 2003–2025 and daily region-wide counts were seen during data checks;
no prediction has been compared with 2022–2025.

**Pass rule, fixed before the final test is opened** (`validation.RULE`): the final method passes when
(1) it has a lower MAE and a lower RMSE than every baseline at cell-month level, and (2) on regional monthly
totals it is not distinguishably worse than the best baseline, meaning the 90% paired bootstrap interval of the
difference in absolute error is not entirely above zero. Scored on coverage-adequate months. If it fails, the
best baseline ships and the result is stated. This rule replaced a stricter one ("lower MAE at both levels")
after the development set showed that 24 monthly totals cannot resolve a 3% difference; because it was
written after seeing 2020–2021, passing it there is not evidence. The strict comparison is still reported.

### Observation gaps

FIRMS files list detections only, so an outage looks like a quiet period. A day counts as missing for a
satellite when it recorded at most 10% of the detections the other satellites imply, at least 30 were
expected, and this lasted three or more days in a row. A month is complete with at least 90% of its days
observed. Found in 2003–2025 (expected = detections implied by the other satellites):

| Satellite | First day | Last day | Days | Detections | Expected |
|---|---|---|---:|---:|---:|
| Terra | 2003-12-17 | 2003-12-23 | 7 | 0 | 978 |
| SNPP | 2012-03-24 | 2012-03-26 | 3 | 16 | 1,432 |
| Terra | 2016-02-22 | 2016-02-25 | 4 | 0 | 208 |
| Aqua | 2020-08-16 | 2020-08-18 | 3 | 21 | 1,075 |
| Aqua | 2020-08-20 | 2020-08-23 | 4 | 21 | 1,017 |
| Aqua | 2020-08-27 | 2020-08-30 | 4 | 19 | 1,886 |
| Aqua | 2022-03-31 | 2022-04-02 | 3 | 5 | 190 |
| Aqua | 2022-04-04 | 2022-04-11 | 8 | 0 | 557 |
| SNPP | 2022-07-27 | 2022-08-10 | 15 | 0 | 40,062 |
| Terra | 2022-10-10 | 2022-10-22 | 13 | 33 | 9,159 |
| N20 | 2023-07-19 | 2023-07-22 | 4 | 0 | 9,429 |
| SNPP | 2024-05-30 | 2024-06-03 | 5 | 0 | 3,690 |
| SNPP | 2024-07-10 | 2024-07-16 | 7 | 0 | 10,167 |
| SNPP | 2024-07-25 | 2024-07-28 | 4 | 0 | 5,586 |
| SNPP | 2024-11-03 | 2024-11-06 | 4 | 0 | 13,719 |

Incomplete months: Terra 2003-12, SNPP 2012-01, Terra 2016-02, Aqua 2020-08, Aqua 2022-04, SNPP 2022-07, SNPP 2022-08, Terra 2022-10, N20 2023-07, SNPP 2024-07, SNPP 2024-11. Months in which Aqua or S-NPP is incomplete are left out of calibration and out
of the main validation scores (scores on all months are kept in the JSON). Single low days are not gaps:
MODIS swaths leave uncovered strips at low latitudes on some days and VIIRS does not. Dates are derived
from the data and still need to be checked against the instrument notices.

### Calibration (2012–2019, January 2012 left out)

- 3,108 cells, 590,520 cell × month × day/night rows. S-NPP recorded 6.5 times as many detections as Aqua
  overall. The ratio is not one number: by day it runs from 2.5 (April) to 5.2 (October), by night from
  5.9 to 15.6, in months where Aqua detected something.
- Aqua recorded nothing in 83% of the rows; in 23% of all rows S-NPP saw detections that Aqua did not.
- **Terra as a witness.** In months where Aqua recorded nothing in a cell, S-NPP averaged 7.2 detections
  when Terra recorded something there and 0.8 when it did not (by night: 10.3 against 0.6). Terra is never
  added to Aqua; it only selects which of two backgrounds applies.
- Chosen by leave-one-year-out Poisson deviance, calibration years only: pooling to the 1° parent cell,
  `K = 50`, `M = 5`, Terra-aware background (`M = 5`). On zero-Aqua months the out-of-year deviance is 2.74
  with whole-extent pooling, 2.56 with parent pooling and 2.19 with the Terra-aware background.

Ratio of S-NPP to Aqua filtered detections by year, complete months only (stability check for the
assumption that the sensor relation holds over time):

| Year | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Day | 5.08 | 5.13 | 5.02 | 5.12 | 5.10 | 5.06 | 5.41 | 5.33 | 5.22 | 5.13 |
| Night | 20.50 | 19.00 | 20.07 | 18.39 | 20.42 | 19.63 | 20.30 | 19.62 | 19.91 | 19.64 |
| All | 6.60 | 6.10 | 6.23 | 6.84 | 6.36 | 6.61 | 6.54 | 6.62 | 6.51 | 6.49 |

### Development-set result (2020–2021, August 2020 left out as an Aqua gap)

Each method predicts the S-NPP monthly count from Aqua alone (and Terra as witness for the final method).
Unit: detections per cell and month (143,152 rows, 3,112 cells); regional columns sum all cells, day + night,
per month (23 months).

| Method | Role | MAE, cell-month | RMSE, cell-month | Bias | Correlation | MAE, regional month | Bias, regional |
|---|---|---:|---:|---:|---:|---:|---:|
| Raw Aqua counts (no harmonization) | reference | 5.01 | 21.42 | -84.6% | 0.847 | 30942.0 | -84.6% |
| One global ratio | baseline | 4.04 | 14.83 | +0.3% | 0.847 | 2953.4 | +0.3% |
| OLS line V = a·A + b, global | baseline | 4.26 | 12.92 | +3.3% | 0.847 | 11327.6 | +3.3% |
| Ratio by month × day/night, no cell term | baseline | 3.66 | 12.85 | +0.3% | 0.884 | 2370.8 | +0.3% |
| F with pooling, no background | ablation | 3.10 | 10.51 | -15.1% | 0.909 | 5513.0 | -15.1% |
| F + static background B | ablation | 3.19 | 10.33 | +1.6% | 0.911 | 2846.0 | +1.6% |
| F + background B, Terra-aware where fitted | candidate | 3.11 | 10.27 | +2.0% | 0.912 | 2612.2 | +2.0% |

What this shows, and what it does not:

- **Per cell the final method is better than every baseline:** MAE 15% lower and RMSE 20% lower than the
  best baseline (ratio by month × day/night).
- **On region-wide monthly totals the best baseline is still ahead:** MAE 2,371 against 2,612 (10% higher
  for the final method). The paired difference averages +241 detections per month with a 90% interval of
  −233 to +695, so the two are not distinguishable on 23 months; the final method is closer in 8 of them.
- The Terra-aware background halves that regional gap (the static background is 20% behind) and improves
  the zero-Aqua months per cell (RMSE 3.25 → 3.00).
- **Remaining weakness: night totals are 8.7% high** and low-season months are less accurate than the
  baseline (MAE 1,295 against 917). The Terra witness did not fix the night bias.
- Without any background the series is 15% low: it leaves out every month in which Aqua saw nothing.
- Removing the instrument effect is the large gain for every method: raw Aqua is 85% below S-NPP.

### How these numbers were reached (three looks at 2020–2021)

1. Weights by leave-one-year-out absolute error, pooling to the whole extent (`K = 50`, `M = 0`), all 24
   months: cell MAE 3.34, regional MAE 3,264, bias +1.0%.
2. Weights by Poisson deviance, wider grid, pooling to the 1° parent, all 24 months: cell MAE 3.27, regional
   MAE 3,252, bias +0.1%. Table: `artifacts/metrics/validation_dev_2020-2021_run2_static_background.md`.
   Absolute error had picked `M = 0` because for counts that are mostly zero it rewards predicting zero.
3. Gap mask and Terra-aware background (the table above). With August 2020 removed, the static background
   turned out further behind on regional totals than run 2 suggested: part of the earlier near-tie came from
   the background compensating for the Aqua outage.

Every change was chosen on 2012–2019 evidence, but each was prompted by what 2020–2021 showed. That is why
2020–2021 is a development set and the claim rests on 2022–2023.

### Still to fill in

| Item | Status |
|------|--------|
| Final test on 2022–2023, late years 2024–2025 | Not opened (one run, after the freeze) |
| Bootstrap intervals for the estimates | Not done (H11) |
| NOAA-20 continuity factor after S-NPP ended | Not done (H11) |
| Before/after-2012 chart, raw vs harmonized | Not done (H8) |
| Sensitivity to the confidence filter; Terra-only 2000-11 → 2002-06 | Not done (H12) |
| Gap dates checked against instrument notices | Not done |

## Findings from the team's Belize 2020 audit (pilot, one country, one year)

MODIS (Terra + Aqua) 1,505 rows vs VIIRS NOAA-20 6,655 rows; overall ratio 4.42, 4.05 by day and 6.22 by night;
daily ratio interquartile range 2.50–6.75; April holds over half the detections. Median pixel footprint
1.43 km² (MODIS) vs 0.196 km² (VIIRS). 316 VIIRS rows at the I4 saturation limit (367 K). Within ±15 min and
5 km, every MODIS–VIIRS candidate pair involved Aqua, none Terra. These motivated: no fixed multiplier, separate
day/night, same-overpass pairs, per-sensor filters.

## Limitations

See [spec/harmonization.md](spec/harmonization.md#13-limitations-to-state-everywhere). Add what the results reveal.
