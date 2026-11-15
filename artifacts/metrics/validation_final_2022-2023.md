### Aqua → S-NPP monthly hotspot counts, final test 2022–2023 (calibrated on 2012–2019; pooling: l1, K = 50, M = 5, Terra-aware background with M = 5, reconciled to the regional ratio with λ = 0.75)

| Method | Role | MAE, cell-month | RMSE, cell-month | Bias | Correlation | MAE, regional month | Bias, regional |
|---|---|---:|---:|---:|---:|---:|---:|
| Raw Aqua counts (no harmonization) | reference | 5.33 | 18.28 | -83.7% | 0.838 | 32873.1 | -83.7% |
| One global ratio | baseline | 4.60 | 14.71 | +6.2% | 0.838 | 3636.4 | +6.2% |
| OLS line V = a·A + b, global | baseline | 4.51 | 11.55 | +5.5% | 0.838 | 9912.8 | +5.5% |
| Ratio by month × day/night, no cell term | baseline | 4.22 | 13.92 | +6.3% | 0.854 | 2753.4 | +6.3% |
| F with pooling, no background | ablation | 3.52 | 10.83 | -10.4% | 0.888 | 4102.3 | -10.4% |
| F + static background B | ablation | 3.54 | 10.59 | +4.6% | 0.891 | 2836.2 | +4.6% |
| F + Terra-aware background B, not reconciled | ablation | 3.47 | 10.53 | +6.4% | 0.893 | 3072.6 | +6.4% |
| Final: F + background B, as fitted (Terra-aware, reconciled) | candidate | 3.46 | 10.43 | +6.3% | 0.896 | 2700.2 | +6.3% |

Source: NASA FIRMS active fire detections (MODIS Aqua, VIIRS S-NPP 375 m), filtered and gridded at 0.25°. Unit: detections per cell and month (MAE, RMSE); regional columns sum all cells and day + night per month. Bias = (predicted − observed) / observed over the period. Rows: 130,536 (3,108 cells). Months left out because a satellite was not fully observing: 2022-04, 2022-07, 2022-08.

### Aqua → S-NPP monthly hotspot counts, late years (reported separately) 2024–2025 (calibrated on 2012–2019; pooling: l1, K = 50, M = 5, Terra-aware background with M = 5, reconciled to the regional ratio with λ = 0.75)

| Method | Role | MAE, cell-month | RMSE, cell-month | Bias | Correlation | MAE, regional month | Bias, regional |
|---|---|---:|---:|---:|---:|---:|---:|
| Raw Aqua counts (no harmonization) | reference | 4.77 | 18.26 | -81.5% | 0.760 | 28981.2 | -81.5% |
| One global ratio | baseline | 5.27 | 17.71 | +20.5% | 0.760 | 7499.0 | +20.5% |
| OLS line V = a·A + b, global | baseline | 5.06 | 14.09 | +18.9% | 0.760 | 11453.7 | +18.9% |
| Ratio by month × day/night, no cell term | baseline | 4.61 | 15.29 | +19.4% | 0.822 | 6923.7 | +19.4% |
| F with pooling, no background | ablation | 3.84 | 12.41 | +0.6% | 0.852 | 4859.5 | +0.6% |
| F + static background B | ablation | 3.89 | 12.22 | +16.7% | 0.856 | 6234.3 | +16.7% |
| F + Terra-aware background B, not reconciled | ablation | 3.85 | 12.16 | +20.1% | 0.858 | 7285.8 | +20.1% |
| Final: F + background B, as fitted (Terra-aware, reconciled) | candidate | 3.88 | 12.26 | +19.7% | 0.853 | 7039.9 | +19.7% |

Source: NASA FIRMS active fire detections (MODIS Aqua, VIIRS S-NPP 375 m), filtered and gridded at 0.25°. Unit: detections per cell and month (MAE, RMSE); regional columns sum all cells and day + night per month. Bias = (predicted − observed) / observed over the period. Rows: 136,840 (3,110 cells). Months left out because a satellite was not fully observing: 2024-07, 2024-11.
