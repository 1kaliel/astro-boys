# Methodology

Living document. Fill in as decisions are made; each choice links to its diary entry.
Owner: Team Harmonization. This feeds the project page's detailed description.

## Study area and period

- Pilot region: _TBD_
- Period: _TBD_ (must include the MODIS/VIIRS overlap)
- Territorial unit: _TBD_ · Grid size: _TBD_ · Time unit: _TBD_

## Data sources

| Sensor / product | Collection / version | Period used | Spatial resolution | Notes |
|------------------|----------------------|-------------|--------------------|-------|
| MODIS (Terra/Aqua) | | | ~1 km | |
| VIIRS (S-NPP / NOAA-20 / NOAA-21) | | | 375 m | |

## Cleaning and quality filters

_Which confidence values are kept and why._

## Harmonization

_Grid, aggregation, how sensor differences are handled._

## Sensor comparison (overlap period)

_Metrics used and results. Link figures in `artifacts/figures/` and tables in `artifacts/metrics/`._

## Sensitivity analysis

_Resolutions tested and how results changed._

## Anomaly detection

_Seasonal baseline, measure (robust z-score / percentile), threshold and why._

## Critical-period prediction

_Target, horizon, features, split dates, baseline, model. Details in [model-card.md](model-card.md)._

## Limitations

- An active-fire detection is not burned area, a fire count, or impact.
- MODIS and VIIRS differ in resolution, sensitivity and overpass time; raw counts are not equivalent.
- Cloud cover and overpass timing cause missed detections.
- _Add as found._
