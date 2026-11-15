# Design system (dashboard)

Owner: Team Dashboard (Guilherme, Cleber). Code: [`app/frontend/src/styles/`](../app/frontend/src/styles/).
Spec it serves: [spec/dashboard.md](spec/dashboard.md). Data it shows: [data-dictionary.md](data-dictionary.md).

The goal is that every view shows results honestly: estimated is never confused with observed, missing is never
shown as zero, and a hotspot is never presented as a fire.

## Layers

Three layers, plain CSS custom properties. No Tailwind, no build step for tokens.

| File | Layer | Rule |
|------|-------|------|
| `primitives.css` | Primitive | Raw values (hex, rem, px). **The only file allowed to hold raw values.** |
| `semantic.css` | Semantic | Purpose aliases (`--color-surface`, `--color-text-secondary`…). Light default, dark overrides |
| `viz.css` | Data viz | Every chart and map color (`--viz-seq-*`, `--viz-div-*`, `--viz-series-*`, marking) |
| `components.css` | Component | Component tokens (`--card-*`, `--tooltip-*`…) and the generic component rules |
| `layout.css` | Layout | App shell, filter bar, 12-column dashboard grid, KPI row, heatmap, map, breakpoints |
| `index.css` | Entry | Imports the layers in order; base element styles; isolated app root (`#root`) |

Dark mode is declared twice on purpose: under `@media (prefers-color-scheme: dark)` with
`:root:where(:not([data-theme="light"]))`, and under `:root[data-theme="dark"]`, so an explicit toggle wins both ways.
The theme button in the app bar sets `data-theme` on `<html>` and remembers it in `localStorage` (if storage is
blocked, it still applies for the visit).

## Dashboard structure

```text
App bar (sticky): title · data badge (Simulated data / model) · How to read · theme
Filter bar (one row, sticky on desktop): Area ▾ · From · To · Time of day · Scale   → scopes every view below
KPI row: [hero: latest month vs median] [busiest month] [year so far vs medians] [months estimated from MODIS]
Burning calendar (8 of 12 columns)                 │ Map (4 of 12): month selected in the calendar
Footer: what this shows · data credit
```

| Rule | Why |
|------|-----|
| Filters live in one row above the content, never inside a card | Every view shows the same slice, so the numbers agree |
| No empty placeholder cards | A card appears only when it has something to show |
| One hero figure per view (≥ 48 px), other KPIs smaller; values compact (12.9K) | The eye lands on one number first |
| Deltas in ink with an arrow and a word ("▼ 60% below the March median") | More or fewer hotspots is not good or bad; no risk claims |
| While data reloads, the previous render stays, dimmed | No skeleton, no layout jump |
| The app root is isolated (`isolation: isolate`) and popups use `--layer-popup` | Base UI popups always open above the map |
| Breakpoints: 75rem (calendar 7 / map 5), 56rem (one column, KPIs 2 × 2, map collapsed until "Show map"), 30rem (phone: 18 px heatmap cells, single-letter months) | Media queries cannot read custom properties: these are the only raw values outside `primitives.css` |

## Burning calendar (heatmap)

Implementation: `features/calendar/BurningCalendar.tsx` (nivo heatmap with our own cell component, task D4). The
rules below are the target; where it still differs (bins over the visible min–max, a tooltip per cell rather than one
readout line, raw scale not available yet) the difference is a follow-up, not a new rule.

- One `<button>` per year × month; 2 px surface gap between cells, never a border.
- Fill: `--viz-seq-1…7`, 7 equal bins from 0 to the 95th percentile of the visible values (top bin includes the rest).
- Scale "Harmonized" shows `count_harmonized`; "Raw by sensor" shows the native count of the month's source satellite,
  with a note that the 2012 jump is the change of sensor.
- Marks: estimated = dashed outline; partial month = corner mark; month outside the data = `--viz-null` ("No data",
  never zero); month on the map = ink ring.
- Keyboard: one tab stop, arrow keys / Home / End / Page Up / Page Down move, Enter selects. A readout line
  (`aria-live`) gives the hovered or focused month in words (value, 90% interval, vs median, provenance), so there is
  one readout instead of 288 tooltips. A table view has the exact values.

## Color jobs

Each color does exactly one job. Text never wears a series color.

| Job | Tokens | Used for |
|-----|--------|----------|
| Sequential (magnitude) | `--viz-seq-1` (least) … `--viz-seq-7` (most) | Calendar heatmap, map cells |
| Diverging (polarity) | `--viz-div-neg-1…4`, `--viz-div-mid`, `--viz-div-pos-1…4` | Anomaly mode: below / above the historical median |
| Categorical (identity) | `--viz-series-1…3` | Trend lines: harmonized, raw Aqua, raw S-NPP |
| Status (state) | `--color-status-*` | UI states only (errors, warnings). Always with an icon and a label. Never data |

### Values

| Token | Light | Dark |
|-------|-------|------|
| `--viz-seq-1` … `--viz-seq-7` | `#cde2fb` → `#0d366b` (blue 100 → 700) | Reversed: `#0d366b` → `#cde2fb` (more activity = lighter) |
| `--viz-div-neg-1` … `-4` | blue 300, 400, 500, 600 | blue 600, 500, 400, 300 |
| `--viz-div-mid` | `#f0efec` | `#383835` |
| `--viz-div-pos-1` … `-4` | `#ff743d`, `#e15000`, `#b43f00`, `#8a2e00` | Reversed: `#8a2e00` … `#ff743d` |
| `--viz-series-1…3` | `#2a78d6`, `#eb6834`, `#1baf7a` | `#3987e5`, `#d95926`, `#199e70` |

Blue steps, series colors and neutrals come from the reference palette of the data-viz skill used through Claude Code
(an AI tool; recorded in [resources.md](resources.md#ai-usage)).
**The orange arm is derived**: for each blue step, the orange (hue of `#eb6834`, about 40.6° in OKLCH) with the same
OKLCH lightness and the largest chroma inside sRGB. Orange instead of red: red reads as an alert, and the product
makes no risk claims.

### Validation (run on Nov 14, 2026)

| Set | Check | Result |
|-----|-------|--------|
| Diverging arms, light (blue and orange) | Ordinal: monotone L, adjacent ΔL ≥ 0.06, light end ≥ 2:1, one hue | Pass |
| Diverging arms, dark (blue and orange, from the midpoint outward) | Same | Pass. A first try with blue 350–500 failed ΔL (0.048) and was replaced |
| Series 1–3, light and dark | Categorical, all pairs (they share charts with the map) | Pass. Aqua is 2.74:1 on the light surface: **always direct-labeled, and a table view exists** |
| Sequential, light and dark | Monotone L, ΔL ≥ 0.06 | Pass. The low end is below 2:1 against the surface **by design** for a sequential scale (near zero recedes). Mitigation: a hairline cell outline, tooltip and table |

To re-run: `validate_palette.js` from that data-viz skill, with `--ordinal` for ramps and `--pairs all` for the series.

## Marking rules

| Case | How it looks | Never |
|------|--------------|-------|
| Observed by VIIRS | Solid fill | |
| Estimated from MODIS (`is_estimated`) | Fill plus a **dashed outline** (`--viz-estimated-outline`), with a legend item "Estimated from MODIS" | Same look as observed |
| Partial month (`is_partial`) | A **corner mark** (`--viz-partial-mark`), tooltip says how many days | Compared with full months without saying so |
| Zero detections | Lightest step plus a hairline outline | |
| No data (no row) | `--viz-null`, the words "No data" in the tooltip | Drawn as zero |
| Selected area on the map | Outline in ink (`--viz-selection`) | Blue (would read as data) |
| Uncertainty | 90% band at `--viz-band-opacity` behind the line, only over estimated months | Hidden |

Texture (hatching at 45°/135°) is **opt-in only**: an accessibility setting, print, or `forced-colors`. Never on by default.

## Words

- Say **hotspots** or **fire activity**. Never "fires", "burned area", "risk", "probability" or "forecast".
- Anomaly thresholds (robust z) are product choices: "not a NASA threshold, not a probability".
- Every chart states source (NASA FIRMS), period, unit and scale ("VIIRS-equivalent hotspot detections").

## Accessibility

- Text contrast ≥ 4.5:1 (secondary ink at most; muted ink is for axis labels and captions only). Marks ≥ 3:1, or a relief channel.
- Every chart has a table view, and tooltips on keyboard focus as well as hover. Minimum hit target and cell size 24 px.
- `prefers-reduced-motion` turns motion off. Focus ring: `--color-ring`, 2 px.

## Components

UI primitives come from [Base UI](https://base-ui.com/) (unstyled, accessible), styled only with our tokens. No Tailwind.

| Folder | Component | Notes |
|--------|-----------|-------|
| `components/ui/` | `Button`, `Card`, `Badge` | `Card` takes a `caption` for source, period and unit. `Badge` kinds: estimated, partial, nrt, simulated |
| `components/ui/` | `Tooltip` (+ `TooltipProvider`), `SegmentedControl`, `YearSelect`, `CoordinateField`, `InfoDialog`, `ChartTableTabs` | Base UI Tooltip, Toggle Group, Select, Number Field, Dialog, Tabs. State attributes used in CSS: `data-pressed`, `data-active`, `data-highlighted`, `data-selected` |
| `components/ui/` | `Popover` | Base UI Popover, used by the Area filter (lat/lon fields, reset to pilot) |
| `components/viz/` | `KpiTile`, `Legend` | KpiTile: label, compact value, delta in ink, badges. Legend: ramp (or the map's fixed class limits) plus provenance marks |
| `features/calendar/` | `BurningCalendar`, `CalendarCell`, `CalendarTable` | Heatmap rules above. Takes the calendar the page loaded (shared with the KPI row) |
| `components/map/` | `MapPanel`, `CellMap`, `MapTools` | Map in a lazy chunk; tools over the map: Flat / Globe, Draw area, Use visible area |
| `state/` | `DashboardProvider`, `useDashboard` | One shared state: area, period (`ALL`/`D`/`N`), scale, year range, selected month |
| `features/dashboard/` | `DashboardPage`, `AppBar`, `FilterBar`, `KpiRow`, `AboutDialog` | Dashboard structure above; "How to read" text is a first draft for task D10 |

Calendar: our own heatmap, not an events calendar (FullCalendar has no year × month view). Map: MapLibre GL JS with
react-map-gl and terra-draw for the rectangle; basemap from OpenFreeMap. react-globe.gl was considered and not used;
deck.gl is deferred to the L3 drill-down.

## Map

| Topic | Rule |
|-------|------|
| Engine | MapLibre GL JS via react-map-gl, in its own lazy chunk (~315 KB gzip). Phones download it only after "Show map" |
| Projection | Flat (Mercator) by default, best for choosing an area. A Flat / Globe toggle uses MapLibre's own globe (no extra library) |
| Basemap | OpenFreeMap Positron (light) or Dark, following the theme. If the style does not load in 5 s, a plain background is used and the map says so |
| Attribution | Comes with the style, compact control, always visible. Never hidden |
| Cells | L2 polygons built in the browser from the cell ID (`lib/grid.ts`); the API sends values only (~9 KB gzip per month) |
| Colors | `--viz-seq-1…7`, read with `getComputedStyle` because MapLibre cannot read `var()`; re-read on theme change. Classes: fixed limits from `/api/cells` (`breaks`: quantiles 50–98% of every positive cell-month), the same for every month so a quiet month looks quiet |
| Estimated month | Cell outlines dashed (`--viz-estimated-outline`), plus the "Estimated from MODIS" badge |
| Selected area | Ink outline (`--viz-selection`), 2 px |
| Precision | `maxZoom` 10: a cell is 28 km wide, so closer zoom would suggest precision the data does not have. Rotation and pitch off |
| Phones | `pixelRatio` capped at 2, no fade, no fly animation with `prefers-reduced-motion`; "Use visible area" selects without drawing |
| Area rule | A cell belongs to the area when it overlaps the bounds; touching an edge is not enough (same rule in `/api/calendar` and `lib/grid.ts`) |

Not used: react-globe.gl (separate three.js engine, ~509 KB gzip, no flat map or area selection), Cesium /
React-CesiumExt (~1.35 MB gzip plus assets; brings OpenLayers and Ant Design, a second UI kit). deck.gl (~276 KB gzip on
top) is kept for the L3 drill-down only if MapLibre is too slow there.

## Open items

- Texture mode tokens (step 4 of the plan).
