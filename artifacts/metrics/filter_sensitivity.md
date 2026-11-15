### Sensitivity to the confidence filter, development years 2020–2021

| Filter | VIIRS / Aqua | Model chosen | MAE cell-month (best baseline) | RMSE (best baseline) | Bias | MAE regional month (best baseline) | Passes the rule | Interval coverage |
|---|---:|---|---:|---:|---:|---:|---|---:|
| nominal_high | 6.52 | l1, K=50, M=5, Terra-aware, λ=0.75 | 3.07 (3.66) | 10.15 (12.85) | +0.8% | 2,283 (2,371) | yes | 94.2% |
| all | 7.13 | l1, K=50, M=5, Terra-aware, λ=0.75 | 3.32 (4.00) | 10.86 (13.38) | +2.6% | 2,867 (2,880) | yes | 94.3% |
| high | 1.43 | l1, K=100, M=20, Terra-aware, λ=1 | 0.37 (0.37) | 1.75 (1.89) | -4.4% | 362 (361) | yes | 97.8% |

Source: NASA FIRMS detections (MODIS Aqua and Terra, VIIRS S-NPP), type 0, pilot bounding box; calibrated on 2012–2019, scored on 2020–2021 with months of satellite outage left out. Unit: detections per cell and month. The final test years (2022–2023) were not used.
