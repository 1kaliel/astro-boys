# Spec: web app and burning calendar (Team Dashboard)

**Status: PROPOSED (plan v2), pending team lock-in.** The stack is the Dashboard team's choice ❓ Q1.
Data comes from [`calendar/v1`](../data-dictionary.md#1-processedcalendarv1--the-dashboards-main-table).

## 1. Who it's for and what it answers

Emergency managers, land managers and scientists. For an area they choose:

1. Which months and years had the most fire activity?
2. How does this month compare with the historical median?
3. Is the long-term picture consistent across the MODIS and VIIRS eras?

## 2. Screen

```text
┌────────────────────────────────────────────────────────────────────┐
│ Area [draw / bbox / lat,lon]   Period [2003–2026]   Day|Night|All  │
│ Scale [Harmonized | Raw by sensor]          Metric [Count|Anomaly] │
├──────────────────────────┬─────────────────────────────────────────┤
│ MAP (grid cells, month   │ CALENDAR  year × 12 months heatmap      │
│ selected in the calendar)│ estimated years hatched / outlined      │
│ click a cell → drill-down│ click a square → map shows that month   │
├──────────────────────────┴─────────────────────────────────────────┤
│ Seasonal profile (p10–p90 band + chosen year) │ Trend: raw vs harm.│
├────────────────────────────────────────────────────────────────────┤
│ This month vs median · How to read · Limitations · Sources · CSV   │
└────────────────────────────────────────────────────────────────────┘
```

One shared state `{area, cells, period, year, month, scale}` drives every view.

## 3. Requirements

### Must (MVP, deployed by Sun 11:00 local)

- [ ] **Area selection:** draw a rectangle on the map, or type lat/lon bounds (or a point + radius). The area
      resolves to the L2 cells it covers.
- [ ] **Date range** selector.
- [ ] **Burning calendar:** heatmap of year × month with `count_harmonized` summed over the area.
      Color-blind-safe sequential ramp (e.g. viridis or cividis), with a legend and numbers on hover.
- [ ] **Estimated months are visibly different** from observed ones (hatch or outline), with a legend:
      "estimated from MODIS" vs "observed by VIIRS".
- [ ] **This month vs historical median** for the area, marked "partial month" when it is.
- [ ] **Map** of L2 cells for the selected month, with scale, legend, source and period.
- [ ] **CSV download** of native hotspots in the area and date range, with provenance columns.
- [ ] **How to read / limitations / sources** panel: detection ≠ fire ≠ burned area; estimates before 2012;
      NASA FIRMS credit and disclaimer link.
- [ ] Loading, empty and error states. All text in **English**.
- [ ] Public URL on Cloud Run that opens with no login; `/healthz` returns 200.

### Should (before the freeze, Sun 15:00)

- [ ] Raw vs harmonized toggle and trend chart (shows the false 2012 step disappearing).
- [ ] Uncertainty band or error bars for estimated months.
- [ ] Day / night / all toggle.
- [ ] Anomaly mode: calendar colored by robust z-score with a diverging color-blind-safe ramp.
- [ ] Seasonal profile: p10–p90 band, median, selected year.
- [ ] Download of the calendar table and chart images.
- [ ] Free polygon drawing.

### Stretch (only after Checkpoint B)

- [ ] **AGGS drill-down:** click an L2 cell to subdivide it 4×4 into L3 cells showing native detections, with
      the neighboring cells for context, and stop rules (max depth L3, minimum detections).
- [ ] AGGS priority index (0–100, L/M/H/H+) per cell ❓ Q8. Product score, not a probability and not a NASA threshold.
- [ ] Filters by biome or municipality (needs IBGE boundaries).
- [ ] VIIRS → MODIS scale as an alternative display.

### Not building

Image upload / georeferencing, fire-spread inference, prediction or alerts.

## 4. Rules the UI must follow

- Say "hotspots" or "fire activity", never "fires" or "burned area", for counts.
- Sum cells first, then compute medians and anomalies (see the data contract).
- The map must not suggest more precision than the data: estimates only at L2 or coarser.
- Never show an index or z-score as a probability of fire.
- Show sensor, period, unit and source on every chart. AI-generated images need a visible watermark.

## 5. Architecture options ❓ Q1

The Dashboard team picks one and logs it as a `DECISION`. All fit the Cloud Run container contract
([deploy/cloudrun/README.md](../../deploy/cloudrun/README.md)).

| Option | Shape | For | Against |
|--------|-------|-----|---------|
| A. API + SPA | FastAPI + DuckDB reading Parquet; frontend in the framework the team knows (Angular or React), MapLibre/Leaflet + a chart library | Area queries and CSV export are simple SQL on the server; scales to large extents | Two pieces to build and integrate overnight |
| B. Static + in-browser | Pre-exported JSON/Parquet per L1 tile; Leaflet + Plotly; served by a tiny static container | Fewest moving parts; works offline | CSV of native hotspots needs pre-cut files; big extents get heavy |
| C. Single Python app | Streamlit or Dash + DuckDB | Fastest to a working demo with one language | Less control over the UI; drawing tools are more limited |

If nobody on the team is fluent in a frontend framework, C is the safe choice; A gives the best result if the
team already knows it. Whatever is chosen, **freeze it tonight**.

## 6. Functional contract with the data

| Need | Source |
|------|--------|
| Calendar, trend, anomalies, map | `processed/calendar/v1` (columns in the data dictionary) |
| CSV of hotspots, L3 drill-down | `processed/hotspots/v1` |
| "About the method" numbers | `artifacts/{run_id}/validation.json` |
| Build before real data exists | The mock `calendar` sample with identical columns |

## 7. Acceptance criteria

- [ ] Changing area or period updates every view.
- [ ] A new user finds the peak fire month of the demo region in under two minutes.
- [ ] Estimated vs observed is obvious without reading the docs.
- [ ] Decade comparisons don't hide the sensor change; the raw toggle shows it.
- [ ] The demo runs start to finish with no manual prep, from the public URL, in a private window.
- [ ] Fallback exists: the same container runs locally from `data/`, plus screenshots in `artifacts/screenshots/`.
