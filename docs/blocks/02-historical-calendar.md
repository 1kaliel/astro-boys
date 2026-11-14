# Block 2: Web app and burning calendar

**Team:** Dashboard (Cleber, Guilherme, Jean) · **Window:** H0–H14 (Sat 09:00–23:00 local) · **Checkpoint:** H14

The team plans its own stack and design; this file holds what the challenge and plan v1 require.

## Goal

Let someone explore the spatial and temporal distribution of fire activity, compare regions, and spot seasonal
patterns or historical change.

## Depends on

- Harmonized dataset from [Block 1](01-harmonization.md). Until then, build against the sample file and the agreed schema in [../data-dictionary.md](../data-dictionary.md).
- Consistent geometries and territorial identifiers.
- Main metric defined: detections, active cells, normalized rate, or other.
- Map and app technology decided.

## Tasks

- [ ] Define the main questions the interface answers.
- [ ] Area selection: draw an area of interest on the map, or enter lat/lon (from the brief).
- [ ] Map with scale, legend, source and period visible.
- [ ] Timeline with range selection.
- [ ] Burning calendar: hotspot counts by month × year, early 2000s → present, accessible color ramp (core of the brief).
- [ ] Current month vs historical median for the selected area.
- [ ] Trend by year or decade, respecting sensor coverage.
- [ ] Filters by biome and/or municipality (optional).
- [ ] Download hotspots in the search as CSV; download charts / analytics (from the brief).
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
