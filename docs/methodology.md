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

## Results to fill in

- QA summary (duplicates, ranges, versions): _link_
- Factors: regional `R` and `B_reg` by month and day/night; chosen `K`, `M`: _values_
- NOAA-20 continuity factor: _value_
- Validation table (2020–2021): _link_
- Before/after-2012 chart: _link_
- Sensitivity (confidence filter, grid level): _link_

## Findings from the team's Belize 2020 audit (pilot, one country, one year)

MODIS (Terra + Aqua) 1,505 rows vs VIIRS NOAA-20 6,655 rows; overall ratio 4.42, 4.05 by day and 6.22 by night;
daily ratio interquartile range 2.50–6.75; April holds over half the detections. Median pixel footprint
1.43 km² (MODIS) vs 0.196 km² (VIIRS). 316 VIIRS rows at the I4 saturation limit (367 K). Within ±15 min and
5 km, every MODIS–VIIRS candidate pair involved Aqua, none Terra. These motivated: no fixed multiplier, separate
day/night, same-overpass pairs, per-sensor filters.

## Limitations

See [spec/harmonization.md](spec/harmonization.md#13-limitations-to-state-everywhere). Add what the results reveal.
