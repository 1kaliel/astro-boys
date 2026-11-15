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
- Both charts are plain SVG in a fixed 640 x 280 box, with a table view; on a narrow screen they scroll sideways
  instead of shrinking the labels. Seen in Chrome on the deployed page (2026-11-15, dark OS mode, 1568 px wide);
  not seen yet: a phone, the light theme.
- Inside the calendar card the diverging tokens are re-pointed to their light values in every OS mode (the card is
  always light): about the median is white, "no comparison" takes the plane color.

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

## Crimson Observatory (interface identity)

The interface identity is a deep-navy dark theme with a crimson accent. It lives in the existing layers: raw values in
`primitives.css` (`--navy-*`, `--slate-*`, `--crimson-*`, `--coral-400`), the roles in `semantic.css`
(`--color-accent`, `--color-accent-hover`, `--color-accent-soft`, `--color-accent-secondary`, `--color-on-accent`), and
the component rules in `components.css`.

| Role | Dark | Light |
|------|------|-------|
| Page / surface / raised | `#080D14` / `#141C28` / `#1D2B38` | unchanged warm neutrals |
| Border / strong border | `#263443` / `#34465A` | unchanged |
| Text primary / secondary / muted | `#F2F5F7` / `#9EAFBD` / `#7E92A3` | unchanged |
| Accent / hover | `#FF4D5A` / `#E63E4D` | `#B3202F` / `#8F1A26` (dark enough for text and borders) |
| Complementary | `#FF9466` | `--orange-500` |

Rules:

- The accent is for identity and interaction only: primary buttons (`.button-primary`, solid), secondary buttons
  (transparent, accent border), the active tab underline, selected options (an accent wash and border), links and the
  focus ring. It never colors a paragraph, and it does not mean "more hotspots" or "alert".
- The scientific scales are untouched: magma, ember, the diverging ramps, the marks for estimated, partial and no-data.
  `viz.css` did not change; `scripts/check_viz_ramp.py` still passes for both themes.
- The calendar is one palette with the rest of the page. In the dark theme it has no island: the card takes the navy
  surface and the cells take the global magma ramp, the same one as the map (ember's darkest step is only 1.4:1 on the
  navy surface, so it cannot live there). The light-theme island (ash plane, petrol ink, ember ramp) is unchanged, with
  one exception: its active month chips take the accent (`--cal-active`).

## Weather layers (ERA5 context)

The map has four layers: Hotspots (the default, magma) and three ERA5 context layers: Temperature, Wind speed (circles on
the cool `--wx-seq-*` ramp, mint to deep blue, flipped in the dark theme like magma) and Wind direction (arrows tinted
with the page ink). Only one layer is on at a time, each with its own legend, unit, period and source, and the hotspot
cells and their 0.25 degree outlines are hidden while a weather layer is on. The ramp is raw in `primitives.css`
(`--teal-100..700`), checked by `scripts/check_viz_ramp.py --theme weather`, and never used for hotspot counts.

The fifth layer, **Live wind**, is the wind of the weather model *now* over a wide region (not ERA5, not tied to the
month or the area). It is drawn as streaks on a canvas over the map, in the page ink with brightness following speed (so
no color is spent on it), and as static arrows with reduced motion. It refreshes by itself and the legend says the model
time, that the animation is time-lapsed and interpolated, and when the answer is stale.

## Typography

Two faces. The **body face**, `--font-sans`, is **Montserrat** (SIL OFL 1.1, self-hosted in
`app/frontend/src/assets/fonts/` with its license; one variable file per subset, so every weight is covered and the
latin-ext subset is only downloaded when a character needs it). The **display face**, `--font-display`, is Neuropolitical (Typodermic Fonts, one weight, no arrows); it is used
for the app title, card and dialog titles, the upper-case labels and the big figures of the KPI and weather cards, and
the month above the map. Everything else (body text, controls, tables, legends, chart text, tooltips) is in
`--font-sans`, because a wide display face at 12 to 14 px is hard to read and its glyph set has no arrows. Montserrat
has no arrows either (the triangles of the comparisons), which fall back to the system font. The stack falls back to
`--font-sans` for a missing file or glyph, and the display rules set the regular weight
and `font-synthesis: none` so the browser never fakes a bold.

**Numbers.** The display face draws 1 like an I and 4 like an H, which is fine in a big figure and wrong in a legend or an
axis. So the calendar's small data labels (axes, legend scale, chips, filter labels) use `--font-display-text`: the
letters of the display face (`unicode-range` on the same file) and the numbers and punctuation of the system font. The
big figures of the KPI and weather cards (32 to 40 px, sized so "115 of 293" stays on one line) keep the full face.

**License.** The free Typodermic license is a desktop one. Live text in a website, where the browser receives the font
file, needs their paid **Webfont license** (their licensing page, "Live website text"). So the file is **not in git**:
it lives in `app/frontend/public/fonts/` and `fonts/`, both git-ignored, and a build without it uses the fallback. To
ship the font on the public site, buy the Webfont license first, or swap `--font-display` for an open (OFL) face.

## Brand: logo and icons

The header shows the Firewatcher signature (symbol and name, `src/assets/brand/`): the normal file on light surfaces and
the `-negativo` file on dark ones, both in the page and switched by CSS from the same dark-theme selectors as the tokens,
so the theme toggle and the OS setting both work. Rules from the brand pack: minimum height 24 px (28 px on a phone, 32
px elsewhere), no recoloring, no effects, room around it. The page title is not drawn at any size (the signature names the app) but stays in the page for screen readers as the
h1; the one-line scope text beside the signature shows from 1408 px, and on a phone the signature takes its own row
above the buttons. Header proportions: signature 40 px high (30 px on a phone), bar 68 px, 12 px vertical padding. The browser icons are in `public/`: `favicon.svg`, the Safari
`favicon-mono.svg`, `apple-touch-icon.png` (iOS does not take SVG), `icons/` (PWA, normal and maskable) and
`site.webmanifest`. The signature's name is outlined, so it does not need the display font (see Typography).
