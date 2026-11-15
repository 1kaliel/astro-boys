### Aqua → S-NPP monthly hotspot counts, development years 2020–2021 (calibrated on 2012–2019; pooling: l1, K = 50, M = 5, Terra-aware background with M = 5, reconciled to the regional ratio with λ = 0.75)

| Method | Role | MAE, cell-month | RMSE, cell-month | Bias | Correlation | MAE, regional month | Bias, regional |
|---|---|---:|---:|---:|---:|---:|---:|
| Raw Aqua counts (no harmonization) | reference | 5.01 | 21.42 | -84.6% | 0.847 | 30942.0 | -84.6% |
| One global ratio | baseline | 4.04 | 14.83 | +0.3% | 0.847 | 2953.4 | +0.3% |
| OLS line V = a·A + b, global | baseline | 4.26 | 12.92 | +3.3% | 0.847 | 11327.6 | +3.3% |
| Ratio by month × day/night, no cell term | baseline | 3.66 | 12.85 | +0.3% | 0.884 | 2370.8 | +0.3% |
| F with pooling, no background | ablation | 3.10 | 10.51 | -15.1% | 0.909 | 5513.0 | -15.1% |
| F + static background B | ablation | 3.19 | 10.33 | +1.6% | 0.911 | 2846.0 | +1.6% |
| F + Terra-aware background B, not reconciled | ablation | 3.11 | 10.27 | +2.0% | 0.912 | 2612.2 | +2.0% |
| Final: F + background B, as fitted (Terra-aware, reconciled) | candidate | 3.07 | 10.15 | +0.8% | 0.914 | 2283.4 | +0.8% |

Source: NASA FIRMS active fire detections (MODIS Aqua, VIIRS S-NPP 375 m), filtered and gridded at 0.25°. Unit: detections per cell and month (MAE, RMSE); regional columns sum all cells and day + night per month. Bias = (predicted − observed) / observed over the period. Rows: 143,152 (3,112 cells). Months left out because a satellite was not fully observing: 2020-08.
