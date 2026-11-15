### Terra → S-NPP monthly hotspot counts, development years 2020–2021 (calibrated on 2012–2019; pooling: l1, K = 20, M = 5, reconciled to the regional ratio with λ = 0.75)

| Method | Role | MAE, cell-month | RMSE, cell-month | Bias | Correlation | MAE, regional month | Bias, regional |
|---|---|---:|---:|---:|---:|---:|---:|
| Raw Terra counts (no harmonization) | reference | 5.36 | 22.59 | -89.5% | 0.810 | 32908.2 | -89.5% |
| One global ratio | baseline | 4.95 | 15.94 | +1.0% | 0.810 | 5895.2 | +1.0% |
| OLS line V = a·A + b, global | baseline | 5.14 | 14.18 | +4.0% | 0.810 | 11746.3 | +4.0% |
| Ratio by month × day/night, no cell term | baseline | 4.89 | 16.05 | +1.1% | 0.812 | 4043.7 | +1.1% |
| F with pooling, no background | ablation | 3.98 | 14.00 | -20.7% | 0.838 | 7775.5 | -20.7% |
| F + static background B | ablation | 3.86 | 13.37 | +4.1% | 0.852 | 3713.1 | +4.1% |
| F + Terra-aware background B, not reconciled | ablation | 3.86 | 13.37 | +4.1% | 0.852 | 3713.1 | +4.1% |
| Final: F + background B, as fitted (Terra-aware, reconciled) | candidate | 3.83 | 13.29 | +1.9% | 0.852 | 3695.3 | +1.9% |

Source: NASA FIRMS active fire detections (MODIS Terra, VIIRS S-NPP 375 m), filtered and gridded at 0.25°. Unit: detections per cell and month (MAE, RMSE); regional columns sum all cells and day + night per month. Bias = (predicted − observed) / observed over the period. Rows: 149,376 (3,112 cells). Months left out because a satellite was not fully observing: none.
