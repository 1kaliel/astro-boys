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
App bar (sticky): FIREWATCHER + subtitle (hotspot calendar, Northeast Brazil, 2002 to present) · data badge (Simulated data / model) · How to read · theme
Filter bar (one row, sticky on desktop): Area ▾ · From · To · Time of day · Scale   → scopes every view below
KPI row: [hero: latest month; unit · period; delta vs median on its own line] [busiest month] [year so far vs medians] [months estimated from MODIS]
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
| Breakpoints: 75rem (calendar 7 / map 5), 56rem (one column, KPIs 2 × 2, map collapsed until "Show map", map tools in a row above a 420 px map), 30rem (phone: the calendar's 12 months fit the card with 20 px cells and one-letter months, so the year labels never scroll away; month buttons 6 + 6; the line charts fit the card; app bar on one row: title on one line, short subtitle, model badge hidden (the calendar card states the model), How to read stays) | Media queries cannot read custom properties: these are the only raw values outside `primitives.css` |
| Touch targets: every control takes `--control-size`: 24 px (`--size-target-min`) with a mouse, 44 px (`--size-target-touch`) under 56rem or with `pointer: coarse`, MapLibre's zoom buttons included | Fingers need 44 px (WCAG 2.5.5, Apple HIG); a mouse does not, and the desktop filter row stays one line |

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
| `--viz-seq-1` … `--viz-seq-7` | `#fcf0b2` → `#3b0f70` (magma 100 → 700: pale yellow, apricot, orange, coral, magenta, purple, deep purple) | Reversed: `#3b0f70` → `#fcf0b2` (more activity = lighter) |
| `--viz-div-neg-1` … `-4` | blue 300, 400, 500, 600 | blue 600, 500, 400, 300 |
| `--viz-div-mid` | `#f0efec` | `#383835` |
| `--viz-div-pos-1` … `-4` | `#ff743d`, `#e15000`, `#b43f00`, `#8a2e00` | Reversed: `#8a2e00` … `#ff743d` |
| `--viz-series-1…3` | `#2a78d6`, `#eb6834`, `#1baf7a` | `#3987e5`, `#d95926`, `#199e70` |

**The sequential ramp is magma** (changed on Nov 14, 2026, from the blue ramp; a `DECISION` by Cleber, see the diary).
Seven colors sampled from the perceptually uniform magma colormap at even lightness steps (L\* 94 to 18). Why: the
calendar is about heat, and a warm ramp reads as heat without a legend lesson; lightness carries the magnitude, so it
survives color vision deficiencies. Trade-off, stated: step 4 is a coral red. The diverging arms still avoid red, and
the sequential ramp is a count scale, not a danger scale (the limitations panel says a hotspot is not a fire). The
blue ramp primitives (`--blue-*`) stay: the negative diverging arm and the series use them.

Blue steps (diverging arm), series colors and neutrals come from the reference palette of the data-viz skill used through Claude Code
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
| Sequential (magma), both themes | `uv run python scripts/check_viz_ramp.py` (in the repo): L\* strictly ordered; neighbouring steps ΔE ≥ 15, and ≥ 8 as seen with protanopia, deuteranopia and tritanopia; least step vs "no data" ΔE ≥ 20 (≥ 8 with deficiencies); most step ≥ 4.5:1 against the surface | Pass. Neighbouring steps ΔE ≥ 18.5 (≥ 11.9 under deficiencies). Weakest point: least step vs "no data" under tritanopia, light theme, ΔE 9.3. Peak vs surface 13.8:1 (light), 15.1:1 (dark). The low steps are 1.1 to 1.6:1 against the surface **by design** for a sequential scale (near zero recedes). Mitigation: a hairline cell outline, tooltip and table |

To re-run: `validate_palette.js` from that data-viz skill, with `--ordinal` for the diverging ramps and `--pairs all` for the
series; `scripts/check_viz_ramp.py` for the sequential (magma) ramp.

## Marking rules

| Case | How it looks | Never |
|------|--------------|-------|
| Observed by VIIRS | Solid fill | |
| Estimated from MODIS (`is_estimated`) | Fill plus a **dashed outline in two layers**: a solid line in the surface color under dashes in `--viz-estimated-outline`, so it shows on pale and on dark cells alike. Legend item "Estimated from MODIS" | Same look as observed; dashes alone (they vanish on dark cells) |
| Partial month (`is_partial`) | A **corner mark** (`--viz-partial-mark`), tooltip says how many days | Compared with full months without saying so |
| Zero detections | Lightest step plus a hairline outline | |
| No data (no row) | `--viz-null`, the words "No data" in the tooltip | Drawn as zero |
| Selected area on the map | Outline in ink (`--viz-selection`) | Blue (would read as data) |
| Uncertainty | 90% band at `--viz-band-opacity` behind the line, only over estimated months | Hidden |

Texture (hatching at 45°/135°) is **opt-in only**: an accessibility setting, print, or `forced-colors`. Never on by default.

## Calendar scale and interaction

- **Scale:** counts are very skewed (a few peak months are many times the typical one), so equal-width steps paint
  most months in the palest colors. The calendar uses **quantiles**: each color holds about the same number of months,
  recomputed for the months on screen. The legend prints where each color starts and says so in one line. Never
  hide the limits.
- **Hover and focus:** the row (year) and the column (month) of the cell under the pointer or the keyboard focus stay
  at full strength, the rest steps back (`--viz-dim-opacity`), and the year and month labels turn bold.
- **Month filter:** buttons for the twelve months, "All months", and "Peak". Peak is computed from the data on screen
  (the three consecutive months with the highest typical activity, partial months left out), not fixed. In the
  Northeast pilot it is September to November, about 65% of the activity of a typical year. No month pressed = all.

## Calendar theme (an island inside the dashboard)

The burning calendar card has its own theme, applied only to that card (`.calendar-theme` in `calendar.css`), in light
and in dark OS mode alike. It re-points the global tokens inside the card, so the buttons, tabs and tooltip there follow
it; nothing outside the card changes. The map and the other cards keep the global tokens (including the magma ramp).

- **Plane and ink:** light gray plane (`--ash-100`), petrol ink (`--petrol-700`), secondary ink (`--petrol-500`), active
  controls and the selection in petrol (`--petrol-600`, `--petrol-700`). Filters are capsules.
- **Scale (ember):** `--ember-100` to `--ember-700`, from cream through peach and orange to earth red, even lightness
  steps (L\* 97 to 22). The colors are quantile steps of the months on screen; the legend is horizontal, under the grid,
  and labels each color with its **range of detections per month**.
- **Cells:** rounded corners and the same 3 px gap in every direction.
- **Month names:** Portuguese (Jan, Fev, Mar, Abr, Mai, Jun, Jul, Ago, Set, Out, Nov, Dez) by request. This is **one
  constant** (`MONTH_LOCALE` in `calendarText.ts`); the rest of the app is English and the challenge requires English
  in every linked material, so set it to `"en"` before submitting unless the team decides otherwise.

States of a month, each with its own look (never color alone):

| State | Look |
|-------|------|
| A count | Solid fill from the ember ramp |
| A valid zero | The palest fill (`--ember-zero`), a hairline and a printed **0**. It is a measurement, so it is not drawn like a gap, and it is set aside from the quantiles |
| Estimated from MODIS | A small white dot with an ink ring in the corner (replaces the dashed outline in this theme) |
| Partial month | A white corner mark with an ink edge: the count is not comparable with full months |
| No data / no estimate | Neutral diagonal **hatching** and no number. Hatching is normally opt-in in this system; the calendar uses it by request, because a missing month must never look like a low one |
| Selected month | A petrol outline with a white edge, so it shows on the darkest fills |
| Keyboard focus | A ring outside the cell, always visible |

Checks (`uv run python scripts/check_viz_ramp.py --theme calendar`, reads the real tokens): neighbouring steps ΔE ≥ 16.2
(≥ 12.7 under protanopia, deuteranopia and tritanopia); least step vs no data ΔE 14.4 (≥ 12.8 with deficiencies; the
pattern is a second channel, so the threshold for this theme is 10); peak vs the plane 10.1:1; ink on the plane 8.2:1;
secondary ink 4.9:1; white on the active control 6.5:1. Known limits: on a phone the grid scrolls sideways and the year
labels scroll with it.

## Line charts, raw view and anomaly mode (D9)

- **Trend** (`features/charts/TrendChart.tsx`): yearly totals of complete years only (an incomplete year is not a
  low year). Three lines on the series tokens, each with its own line style so they read without color: harmonized
  (`--viz-series-1`, solid, on top), Aqua MODIS raw (`--viz-series-2`, dashed), S-NPP VIIRS raw (`--viz-series-3`,
  wide and translucent under the harmonized line, which equals it after 2012). A hollow point is a year with months
  estimated from MODIS. Raw counts of different satellites are separate lines and are never added.
- **Seasonal profile** (`features/charts/SeasonalProfile.tsx`): band from the 10th to the 90th percentile and median
  (dashed) of the complete months of the years shown, at least 5 years; one year over it (the year of the month
  picked in the calendar, or the latest). Error bars are the 90% interval of that year's estimated months; a hollow
  point is a partial month.
- **Raw by sensor** (calendar): each month shows the native count of its source satellite, with no estimate mark,
  interval or anomaly, and a notice that the 2012 jump is the change of sensor.
- **Anomaly** (calendar): months colored by robust z-score on the diverging tokens, in nine classes with limits at
  0.5, 1, 2 and 3 (`lib/charts.ts`): blue below the median, orange above, neutral without a comparison. The legend
  prints the limits. A z-score is never worded as a probability or a risk.
- Both charts are plain SVG in a fixed 640 x 280 box, with a table view. Between 30rem and a 480 px card they scroll
  sideways instead of shrinking the labels; on a phone (30rem) they fit the card, so all twelve months (the Sep–Nov
  peak included) and every year label are in view: the labels are drawn at 20 units (about 10 px on a 360–390 px
  screen), the month and year labels move 8 units down, clear of the value axis, and the first and last label may pass
  the drawing edge into the card padding. Seen in Chrome on the deployed page (2026-11-15, dark OS mode, 1568 px wide);
  not seen yet: a phone, the light theme.
- Inside the calendar card the diverging tokens are re-pointed to their light values in every OS mode (the card is
  always light): about the median is white, "no comparison" takes the plane color.

## Downloads (D9)

- **Calendar table as CSV**: a "Table: Download CSV" button above the calendar. Built in the browser from the months in
  memory (`lib/exportFile.ts`, `calendarCsv`), for the scale (harmonized or raw by sensor), time of day, years and months
  on screen. First rows are `#` comments with title, unit, area, period, series, model version, source and how to read
  the interval; then one row per month: `year,month,count,ci90_low,ci90_high,is_estimated,is_partial,source_satellite,
  series,time_of_day,model_version`. Counts and intervals are rounded like the table; **no data or no estimate is an
  empty count, never 0** (a month outside the data has empty flags too); estimated and partial months are also listed
  in closing `#` rows.
- **Chart images**: "Image: SVG, PNG" under the calendar heatmap, the seasonal profile and the trend chart
  (`components/ui/DownloadBar.tsx`, `lib/chartExport.ts`). The SVG on screen is cloned with its computed styles inlined
  (CSS variables and `currentColor` resolved), so the file needs no stylesheet and keeps the theme on screen (dark, light,
  the calendar's light island). Title, series, legend, unit, area, period, source, model version and the "not fires"
  sentence are written as text. PNG is the same SVG drawn at 2x.
- Real `<button>`s with labels (`Button`), keyboard operable; under 56rem and on touch the targets are 44 px through
  `--control-size`, like every other button.

## Words

- Say **hotspots** or **fire activity**. Never "fires", "burned area", "risk", "probability" or "forecast".
- Anomaly thresholds (robust z) are product choices: "not a NASA threshold, not a probability".
- Every chart states source (NASA FIRMS), period, unit and scale ("VIIRS-equivalent hotspot detections").

## Accessibility

- Text contrast ≥ 4.5:1 (secondary ink at most; muted ink is for axis labels and captions only). Marks ≥ 3:1, or a relief channel.
- Every chart has a table view, and tooltips on keyboard focus as well as hover. Minimum hit target and cell size 24 px with a mouse; controls are 44 px on touch screens and narrow windows (heatmap cells on a phone: 20 px, with the table view as the exact alternative).
- `prefers-reduced-motion` turns motion off. Focus ring: `--color-ring`, 2 px.

## Components

UI primitives come from [Base UI](https://base-ui.com/) (unstyled, accessible), styled only with our tokens. No Tailwind.

| Folder | Component | Notes |
|--------|-----------|-------|
| `components/ui/` | `Button`, `Card`, `Badge` | `Card` takes a `caption` for source, period and unit. `Badge` kinds: estimated, partial, nrt, simulated |
| `components/ui/` | `Tooltip` (+ `TooltipProvider`), `SegmentedControl`, `YearSelect`, `CoordinateField`, `InfoDialog`, `ChartTableTabs` | Base UI Tooltip, Toggle Group, Select, Number Field, Dialog, Tabs. State attributes used in CSS: `data-pressed`, `data-active`, `data-highlighted`, `data-selected` |
| `components/ui/` | `Fold` | Native `<details>`: secondary detail one click away, e.g. "About the 90% intervals" under the calendar legend. Summary at `--control-size` |
| `components/ui/` | `Popover` | Base UI Popover, used by the Area filter: four fields in a 2 × 2 grid, a live preview (L2 cells, size in km, why the box cannot be applied, edges clamped to the study area), "Reset to the study area" |
| `components/viz/` | `KpiTile`, `Legend` | KpiTile: label, compact value, detail (unit · period), comparison (the delta vs a named baseline, its own line, in ink: never a series, accent or status color), badges. Legend: ramp (or the map's fixed class limits) plus provenance marks |
| `features/calendar/` | `BurningCalendar`, `CalendarCell`, `CalendarTable` | Heatmap rules above. Takes the calendar the page loaded (shared with the KPI row) |
| `components/map/` | `MapPanel`, `CellMap`, `MapTools`, `DrillLegend` | Map in a lazy chunk; tools over the map: Flat / Globe, Draw area, Use visible area; in the L3 drill-down, Back to L2 cells |
| `state/` | `DashboardProvider`, `useDashboard` | One shared state: area, period (`ALL`/`D`/`N`), scale, year range, selected month, drilled cell (cleared when the month, period or area changes) |
| `features/dashboard/` | `DashboardPage`, `AppBar`, `FilterBar`, `KpiRow`, `AboutDialog` | Dashboard structure above; "How to read" text is a first draft for task D10 |

Calendar: our own heatmap, not an events calendar (FullCalendar has no year × month view). Map: MapLibre GL JS with
react-map-gl and terra-draw for the rectangle; basemap from OpenFreeMap. react-globe.gl was considered and not used;
deck.gl was kept for the L3 drill-down, which turned out not to need it (16 cells and 9 outlines are plain MapLibre layers).

## Map

| Topic | Rule |
|-------|------|
| Engine | MapLibre GL JS via react-map-gl, in its own lazy chunk (~315 KB gzip). Phones download it only after "Show map" |
| Projection | Flat (Mercator) by default, best for choosing an area. A Flat / Globe toggle uses MapLibre's own globe (no extra library). Globe opens on the whole globe turned to the study area (zoom from the map size, `globeZoomToFit`), with free panning and zoom out; the study area is dashed and labeled "Study area: Northeast Brazil · data processed only here", and a click on it (below zoom 3) or on its label flies in. Nothing is drawn outside it: no data there is never shown as zero. Back to Flat frames the selected area again |
| Basemap | OpenFreeMap Positron (light) or Dark, following the theme. If the style does not load in 5 s, a plain background is used and the map says so |
| Attribution | Comes with the style, compact control, always visible. Never hidden |
| Cells | L2 polygons built in the browser from the cell ID (`lib/grid.ts`); the API sends values only (~9 KB gzip per month) |
| Colors | `--viz-seq-1…7`, read with `getComputedStyle` because MapLibre cannot read `var()`; re-read on theme change. Classes: fixed limits from `/api/cells` (`breaks`: quantiles 50–98% of every positive cell-month), the same for every month so a quiet month looks quiet |
| Estimated month | Cell outlines dashed (`--viz-estimated-outline`), plus the "Estimated from MODIS" badge |
| Selected area | Ink outline (`--viz-selection`), 2 px, at every zoom |
| Cell grid | The outline of each L2 cell of the area (`--viz-selection`, 0.5 px) fades in with zoom: hidden below 16 px per cell (zoom ~5.5), full (0.6 opacity) from 32 px (zoom ~6.5), `GRID_FADE` in `components/map/view.ts`. At the zoom that frames the area, 4,000 outlines were a mesh that hid the colors |
| No detection | A cell with no detection that month is not drawn: the basemap shows through (dark squares on the dark basemap). Never a zero-colored cell; the legend says so |
| Precision | `maxZoom` 12: an L2 cell (28 km) is about 1,450 px and an L3 sub-cell about 360 px wide, so you can read the roads and terrain inside them. The zoom does not add precision: estimates are only ever drawn as whole 0.25° cells, and the 0.0625° sub-cells show native detections only (drill-down). Rotation and pitch off |
| Cell fill by zoom | `fill-opacity` interpolated by zoom (`FILL_FADE` in `components/map/view.ts`): 0.85 while a cell is at most 16 px (the overview; the same 16 px as the grid fade), down to 0.45 from 256 px (zoom ~9.5), so roads, rivers and terrain read through a cell you zoomed into. The color, so the legend class, never changes. The L3 sub-cells use the same ramp 2 zoom levels later (4 x smaller) |
| Label order | The data layers (cell fills, grid, drill-down fills and hairlines) are inserted before a hidden anchor layer placed at the start of the basemap's trailing block of label (symbol) layers (`withDataAnchor`), so place names stay on top at every zoom and roads and borders stay under the cells, in both OpenFreeMap styles; one anchor id for both styles, so a theme switch never refers to the other style's labels. The ink outlines (selected area, study area, drilled cell, focus) stay above the labels. The offline style has no labels: the anchor sits on top of its background |
| Focus | From 64 px per cell (zoom ~7.5; ~9.5 for L3 sub-cells in the drill-down) the cell at the map center, or under a mouse pointer, gets an ink outline (`--viz-selection`, 2.5 px on a 5 px `--color-surface` halo) and a chip bottom left over the map: "Cell G…: N VIIRS-equivalent hotspots · Month YYYY · Estimated from MODIS · Partial month" and how to open its 16 sub-cells (Click / Tap it / press Enter); in the drill-down "Sub-cell G….NN: N native detections · Month YYYY" and "<satellite> <instrument>, not harmonized". The other cells are dimmed to 80% of their opacity. A cell with no detection is outlined, never filled, and the chip says "no hotspot detection" and "No detection does not mean no fire"; outside the study area there is no focus. Touch screens (no hover) always use the center cell; the hover popup is not shown for the cell the chip already describes. The chip is a polite live region. No focus while drawing an area |
| Phones | `pixelRatio` capped at 2, no fade, no fly animation with `prefers-reduced-motion`; "Use visible area" selects without drawing. Tools above the map in one column; the attribution starts folded (the "i" button) under 640 px of map width, so it does not cover the cells |
| Area rule | A cell belongs to the area when it overlaps the bounds; touching an edge is not enough (same rule in `/api/calendar` and `lib/grid.ts`) |
| L3 drill-down (D11) | A click on an L2 cell (or Enter on the focused map, for the cell at its center) frames its 3 x 3 block and asks `/api/drilldown`. The harmonized fill, the area outline and the area tools are hidden: only native detections of the month's source satellite are on screen. The target's 16 L3 cells (0.0625°) are filled on the sequential tokens with their own classes (at most 4 equal whole-number steps between the lowest and highest sub-cell, `drillBreaks` in `lib/scale.ts`); empty sub-cells stay unfilled with a hairline. The 8 neighbors are dashed outlines labeled with their native count, and a click on one moves the drill-down there. Its own legend: "Native detections, <satellite> (<instrument>), <month>: not harmonized". Max depth L3; a cell with fewer than `min_detections` (5) is not subdivided and says so. "Back to L2 cells" or Escape restores the previous view; a new month, period or area also leaves it. 503 reads "Detections are unavailable right now" (with Retry); a 422 for a month without data is a neutral note |

Not used: react-globe.gl (separate three.js engine, ~509 KB gzip, no flat map or area selection), Cesium /
React-CesiumExt (~1.35 MB gzip plus assets; brings OpenLayers and Ant Design, a second UI kit). deck.gl (~276 KB gzip on
top) is kept for the L3 drill-down only if MapLibre is too slow there.

## Open items

- Texture mode tokens (step 4 of the plan).
