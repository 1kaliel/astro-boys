### Aqua → S-NPP monthly hotspot counts, test years 2020–2021 (calibrated on 2012–2019; pooling: l1, K = 50, M = 5)

| Method | Role | MAE, cell-month | RMSE, cell-month | Bias | Correlation | MAE, regional month | Bias, regional |
|---|---|---:|---:|---:|---:|---:|---:|
| Raw Aqua counts (no harmonization) | reference | 5.06 | 21.34 | -85.0% | 0.842 | 31250.6 | -85.0% |
| One global ratio | baseline | 4.08 | 14.86 | -2.2% | 0.842 | 3743.6 | -2.2% |
| OLS line V = a·A + b, global | baseline | 4.31 | 13.05 | +1.3% | 0.842 | 11530.1 | +1.3% |
| Ratio by month × day/night, no cell term | baseline | 3.73 | 13.01 | -2.1% | 0.877 | 3168.5 | -2.1% |
| F with pooling | candidate | 3.18 | 10.77 | -17.1% | 0.902 | 6304.5 | -17.1% |
| F with pooling + background B | candidate | 3.27 | 10.58 | +0.1% | 0.904 | 3252.4 | +0.1% |

Source: NASA FIRMS active fire detections (MODIS Aqua, VIIRS S-NPP 375 m), filtered and gridded at 0.25°. Unit: detections per cell and month (MAE, RMSE); regional columns sum all cells and day + night per month. Bias = (predicted − observed) / observed over the test period. Test rows: 149,376 (3,112 cells).
