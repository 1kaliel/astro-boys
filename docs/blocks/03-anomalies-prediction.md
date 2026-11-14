# Block 3: Anomalies and critical-period prediction

**Budget:** 24 hours (H14–H38; baseline work starts at H6) · **Leads:** Person 5 (anomalies, stats) + Person 6 (prediction, infra) · **Checkpoint:** H28

## Goal

Show, with rigor proportional to a hackathon, regional anomaly detection and an estimate of critical periods.
The result is **experimental** and must not be presented as an operational alert.

## Depends on

- Block 1 accepted and stable.
- Unambiguous target and horizon.
- Enough history for a temporal train/test split.
- Weather/environment data aligned in space and time, if used.
- API query budget monitored (Meteomatics quota, FIRMS transaction limits).

## 3.1 Anomaly detection

- [ ] Seasonal baseline per region and time unit.
- [ ] Compare observed values with the same season/period in history.
- [ ] An interpretable measure: robust z-score, percentile, or deviation from the median.
- [ ] Choose a threshold and record why (diary `DECISION`).
- [ ] Show anomalies on the map and/or calendar.
- [ ] Manually review positive and negative examples.

## 3.2 Critical-period prediction

- [ ] Define the target **before** training, e.g. "next week above the regional 90th percentile of activity".
- [ ] Define forecast horizon and geographic unit.
- [ ] Simple baseline: seasonal climatology or persistence.
- [ ] Features use only information available at forecast time.
- [ ] Add weather/environment only if time and coverage allow.
- [ ] Train a simple, interpretable model before trying complex ones.
- [ ] Split train / validation / test **by time**, never randomly where that leaks.
- [ ] Compare the model to the baseline.
- [ ] Show uncertainty, limitations and intended use.

Candidate features: recent fire activity; seasonality and trend; temperature; accumulated precipitation; wind;
humidity (if available and consistent); land cover / vegetation (from a suitable source).

## Deliverables

- Anomaly notebook or script.
- Training and evaluation notebook or script.
- Documented baseline.
- Serialized model or reproducible results.
- Test-set metrics table (`artifacts/metrics/`).
- Examples, errors and feature importance visuals (`artifacts/figures/`).
- Model card: [../model-card.md](../model-card.md).

## Acceptance criteria

- [ ] Target, region, horizon and evaluation period written in plain language.
- [ ] The data split respects time order.
- [ ] The model is compared to at least one baseline.
- [ ] Metrics fit the problem and include per-class / per-region performance where relevant.
- [ ] No future data in input features.
- [ ] The demo shows at least one hit and one miss.
- [ ] The team can explain why the model may fail.
- [ ] The interface says "risk", "probability" or "critical period", never promising an exact fire.

## Recommended scientific validation

- Validate outside the period used to build rules and train.
- Compare results by sensor, region and season.
- Test sensitivity to resolution and confidence filters.
- Check spatial and temporal autocorrelation before claiming significance.
- Compare with independent sources when available; say so clearly when there's no external validation.
- Document biases: coverage, clouds, resolution, overpass time, sensor differences.
- Get review from someone with remote-sensing, fire-science or land-management experience before any real use.

## H28 checkpoint

The prediction goes into the main story **only if it beats the baseline or adds clear value**. Otherwise it
becomes an exploratory analysis with no predictive claim.
