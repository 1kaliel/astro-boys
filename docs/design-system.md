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
| `components.css` | Component | Component tokens (`--card-*`, `--tooltip-*`…) and the rules that use them |
| `index.css` | Entry | Imports the layers in order; base element styles |

Dark mode is declared twice on purpose: under `@media (prefers-color-scheme: dark)` with
`:root:where(:not([data-theme="light"]))`, and under `:root[data-theme="dark"]`, so an explicit toggle wins both ways.

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

## Open items

- Texture mode tokens (step 4 of the plan).
- Map basemap provider and attribution: decided in task D3.
