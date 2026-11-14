# Block 1: Data harmonization

**Team:** Harmonization (Kali, Justino, Mateus) · **Window:** H0–H8 (Sat 09:00–17:00 local) · **Checkpoint:** H8

## Goal

A dataset where MODIS and VIIRS are comparable, every observation keeps its origin, and sensor differences are
not mistaken for real changes in fire activity.

## Depends on

- Area and period for the data pull decided (task H2 in [../tasks.md](../tasks.md)).
- FIRMS access and the chosen products. How: [../data-access.md](../data-access.md).
- Region / municipality / biome boundaries, if used.
- Reproducible processing environment; space for raw and processed data.

## Tasks

- [ ] Record region, period, products and download date/time for every download (`data/raw/SOURCES.md`).
- [ ] Download a real MODIS and VIIRS sample from FIRMS.
- [ ] Keep raw files untouched.
- [ ] Write the data dictionary ([../data-dictionary.md](../data-dictionary.md)): names, types, units, meaning.
- [ ] Standardize dates, times, coordinates, sensor names and missing values.
- [ ] Apply the same spatial and temporal clip to both sensors.
- [ ] Define quality/confidence filters and document why.
- [ ] Aggregate to a common space × time unit.
- [ ] Compare sensors over the period where both have coverage.
- [ ] Write a short validation report with limitations.
- [ ] Export a versioned harmonized dataset.

## Comparison method

1. Keep a `sensor` column; never drop provenance.
2. Compare on a common grid and time interval, not exact point-to-point matching.
3. On the overlap period, per cell and interval:
   - detections per sensor;
   - presence/absence of activity;
   - difference and ratio of counts (when the denominator allows);
   - temporal correlation per region;
   - occurrence agreement: precision, recall, F1 where appropriate.
4. Sensitivity analysis with at least two spatial or temporal resolutions.
5. Treat MODIS and VIIRS as instruments with different capabilities; raw counts are not directly equivalent.

## Deliverables

| Deliverable | Location |
|-------------|----------|
| Original files + source log | `data/raw/` (git-ignored) + `data/raw/SOURCES.md` |
| Harmonized dataset (CSV / Parquet / GeoParquet), versioned | `data/processed/` |
| Data dictionary | [../data-dictionary.md](../data-dictionary.md) |
| Reproducible download + transform script or notebook | `scripts/`, `src/`, `notebooks/` |
| Validation report with charts and agreement metrics | `artifacts/metrics/`, `artifacts/figures/`, [../methodology.md](../methodology.md) |
| Resolution, filter and limitation decisions | diary + [../methodology.md](../methodology.md) |

## Acceptance criteria

- [ ] Someone else can run the pipeline from the repo instructions.
- [ ] Every processed row has identifiable sensor, product and time reference.
- [ ] Coordinates, dates, timezone and missing values follow a documented standard.
- [ ] The same clip is applied to both sensors.
- [ ] Validation uses only the proper overlap period.
- [ ] At least one agreement metric, one comparison chart and one sensitivity analysis.
- [ ] The docs state that an active detection ≠ burned area, number of fires, or impact.
- [ ] The dataset feeds Block 2 with no hidden manual steps.

## H8 checkpoint

If harmonization isn't meeting the criteria: **shrink the region and/or period**. Never move on with data that lacks provenance.
