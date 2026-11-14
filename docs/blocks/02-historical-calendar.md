# Block 2: Smart historical calendar

**Budget:** 8 hours (H6–H14) · **Lead:** Person 4 (app & visualization) · **Checkpoint:** H14

## Goal

Let someone explore the spatial and temporal distribution of fire activity, compare regions, and spot seasonal
patterns or historical change.

## Depends on

- Harmonized dataset from [Block 1](01-harmonization.md).
- Consistent geometries and territorial identifiers.
- Main metric defined: detections, active cells, normalized rate, or other.
- Map and app technology decided.

## Tasks

- [ ] Define the main questions the interface answers.
- [ ] Map with scale, legend, source and period visible.
- [ ] Timeline with range selection.
- [ ] Seasonality calendar / matrix per region.
- [ ] Trend by year or decade, respecting sensor coverage.
- [ ] Filters by biome and/or municipality.
- [ ] Empty, loading and error states.
- [ ] Short methodology and limitations shown inside the app.
- [ ] End-to-end test with real data.

## Deliverables

- App (local or published), navigable without editing code.
- Map with synchronized timeline.
- Regional seasonality calendar.
- Historical trend chart.
- Working biome and/or municipality filter.
- Backup screenshots for the presentation (`artifacts/screenshots/`).

## Acceptance criteria

- [ ] Selecting region and period updates every relevant view.
- [ ] The interface clearly shows sensor, period, unit and source.
- [ ] A user finds the pilot region's seasonal peak in under two minutes.
- [ ] Decade comparisons don't hide sensor or coverage changes.
- [ ] The map doesn't suggest more spatial precision than the data has.
- [ ] The main demo runs start to finish with no manual prep.
- [ ] A fallback mode exists with local data and screenshots.

## H14 checkpoint

If the prototype isn't navigable: **freeze new visualizations** and finish the ones in progress.
