# Spec: FIREWATCHER web app and burning calendar

**Status:** implemented baseline synchronized with main `0b8dbdd5a21422ab30d3c53db0333d77367fd204`
on 15 November 2026. This is an evidence snapshot, not a claim that later commits are deployed.
Owners: Guilherme (map/backend), Cleber (calendar/charts/backend), Jean (UI wording, screenshots, S2 demo).
Stack: FastAPI + DuckDB, React + TypeScript + Vite, MapLibre GL JS and nivo; one container serves API and frontend.

## 1. Purpose and scope

Explore historical hotspot activity in the Northeast Brazil bounding box. The calendar covers July 2002 through
November 2026, with observations through 14 November. Users select an area and period to examine seasonal peaks,
the current month against its historical median, anomalies, and instrument differences.

This is an exploratory prototype. A hotspot is a satellite detection, not a fire count or burned area.
No forecast, risk probability, early-warning service or emergency-decision claim is made.

## 2. Current screen and data flow

The app bar identifies FIREWATCHER and the Northeast Brazil pilot. Shared state links the area, year range,
selected month, day/night period and calendar scale. The map, calendar, headline indicators, seasonal profile,
trend and exports use that selection.

| Component | Implemented behavior | Evidence |
|---|---|---|
| Area | Rectangle drawing, typed bounds, use visible area, reset to the pilot; resolves overlapping L2 cells | D3/D7; PRs 69/71 |
| Period | Year range and selected month; all/day/night | D5/D9 |
| Calendar | Year by month; harmonized, raw by sensor and anomaly views; estimated, partial and missing states distinguished | D4/D9 |
| Map | L2 counts, Flat/Globe, study-area boundary, zoom focus and readable basemap labels | PRs 69/71; revision 00008 captures |
| Current-month comparison | Partial month compared with the same elapsed days in historical years | D5 |
| Charts | Raw versus harmonized trend; seasonal profile; intervals for estimates | D9; methodology |
| Native export | Normalized, filtered detections with satellite/product provenance; large exports have an explicit limit | D6; PR 76 |
| Calendar/chart export | Monthly CSV with interval/provenance columns; SVG and PNG chart images | PR 75 |
| Help | English How to read, limitations, method, source and FIRMS disclaimer links | D10 validation |
| Drill-down | Native detections only, L2 to 16 L3 positions, neighboring cells and stop rules | D11; D12 capture 11 |

The map colors show counts in angular cells, not equal-area density. Harmonized estimates are never subdivided
into L3 observations. Native sensor counts are not added across satellites.

## 3. Implemented requirements and remaining scope

### Must: delivered baseline

- [x] Area selection through rectangle, bounds or visible map area; date selection.
- [x] Calendar with legend, values and distinct estimated/observed, missing and partial-month states.
- [x] Current month versus historical median, with elapsed-day handling.
- [x] L2 map linked to the calendar.
- [x] Native-detection CSV with provenance and explicit errors/limits.
- [x] English explanations, loading/empty/error states and source credits.
- [x] Public Cloud Run application; production probes use `/api/healthz` and `/api/version`.
      The container also exposes `/healthz`, but that root path is reserved on the run.app host.

Completion is the recorded D1–D10 acceptance, not a fresh usability or accessibility certification.

### Should

- [x] Raw-by-sensor comparison and trend; day/night/all; anomaly view.
- [x] Estimated-month uncertainty and seasonal profile.
- [x] Calendar CSV and chart SVG/PNG downloads (PR 75, included in revision 00008).
- [ ] Free polygon drawing. Rectangle selection is delivered; arbitrary polygons and point-radius selection
      are not claimed.

The raw comparison illustrates sensor differences. Harmonization does not prove that every change around 2012
is artificial. The seasonal profile's usual historical range and an estimate's 90% interval are different
quantities; wording must follow [methodology.md](../methodology.md).

### Stretch

- [x] L3 native drill-down and neighbors (D11): maximum depth L3; subdivision requires at least five detections.
- [ ] AGGS priority index, biome/municipality filters, inverse VIIRS-to-MODIS display.
- [ ] National or global product. Showing the whole globe does not extend the processed study area.

Image uploads, fire-spread inference and prediction remain outside scope.

## 4. Export and scientific contracts

- Sum the selected cells before computing area medians/anomalies.
- Preserve period, unit, source, satellite and model version. Missing is not zero; no detection is not no fire.
- Historical filters use presumed vegetation type and nominal/high confidence. Untyped 2026 NRT records keep
  `type = null` and enter provisional counts under the documented exception.
- Native CSV and the harmonized calendar CSV are different products. Native counts carry no harmonized interval.
- `/api/hotspots/count` returns an exact count only when `over_limit = false`; otherwise `rows` is a lower bound.
- Export images carry titles, units, area, period, source and model information.
- User-drawn-area intervals are approximate; preserve the visible qualification.
- Never present a z-score or product threshold as a NASA probability or threshold.

Dataset schemas: [data dictionary](../data-dictionary.md). Calendar/map/chart source:
`processed/calendar/v1`; native export/drill-down: `processed/hotspots/v1`.
Synthetic fixtures are development aids and must remain visibly identified.

## 5. Release and acceptance evidence

The last release documented in the synchronized main is **astro-dashboard-00008-m2v**, image **3957039**,
approved by Kali. [D12 validation](../d12-validation.md) records final captures and API/browser checks.
[D11/D12 in the task board](../tasks.md) are complete.

- Observed drill-down example: G083135.16, September 2013, S-NPP, 639 native detections, 16 L3 positions and neighbors.
- Captures 01–08 are revision 00006; 09–19 are revision 00008; 20 is the earlier local offline run.
- Offline fallback: [runbook](../../deploy/local/run-offline.sh) and [test record](../d12-offline-test.md).
  No external basemap offline; native CSV serves only years present locally. Partly covered ranges remain a limitation.
- Not verified: a physical phone, Safari/Firefox, screen-reader use or a formal contrast audit.
- A timed test proving that a new user finds the peak month in under two minutes has not been recorded.
- A complete private-window submission walkthrough remains S5; individual live tests do not close it.
- This documentation update does not repeat browser, offline or scientific tests.

## 6. Proposed changes and maintenance

At this snapshot, PR 82 is an unmerged UX/native-filter proposal. Its thermal ramp, FRP/confidence controls,
KPI evidence panels, sensor-layer selector and ten-year initial range are not part of this accepted baseline.
Work merged into `teste-visual` is also not automatically in main or production.

When GitHub changes, update this spec using the exact merged commit, task acceptance, test report and deployment
revision. Distinguish planned, integrated, deployed and verified. Keep everything in English; record scientific
changes in the methodology/artifacts, preserve limitations, and append the decision in the diary.
Future merges do not update this document automatically.
