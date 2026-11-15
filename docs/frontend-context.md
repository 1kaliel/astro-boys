# Frontend context: Team Dashboard

Written for: Dashboard team members and AI coding agents who work on `app/frontend/`.
Snapshot taken on 2026-11-14 (Sat), on branch `feat/app-skeleton` (commit `72d91ed`).

This file describes the frontend only. For the whole project, see [project-context.md](project-context.md).
When this file disagrees with [spec/dashboard.md](spec/dashboard.md) or the diary, the spec and the diary win.

## 1. What the frontend must do

Spec: [spec/dashboard.md](spec/dashboard.md). Summary:

- **Area selection:** draw a rectangle on a map, or type lat/lon bounds. The area resolves to L2 cells (0.25°).
- **Date range** selector.
- **Burning calendar:** year × month heatmap of hotspot counts, summed over the selected area. Colorblind-safe
  sequential ramp, legend, values on hover. Estimated months are visibly marked (hatch or outline).
- **This month vs historical median**, flagged as a partial month when it is one.
- **Map** of L2 cells for the selected month. Clicking a calendar square sets the map to that month.
- **CSV download** of native hotspots for the area and dates.
- **"How to read / limitations / sources" panel** (detection is not fire, not burned area; estimates before 2012;
  NASA FIRMS credit and disclaimer).
- **Loading, empty and error states.** All text in **English**.
- **Public URL on Cloud Run** with no login. `/healthz` returns 200.

Should-haves (before the 15:00 freeze): raw vs harmonized toggle and trend; uncertainty bands; day/night toggle;
anomaly mode (robust z-score, diverging ramp); seasonal profile; chart downloads; free polygon drawing.

Not building: image upload, fire-spread inference, prediction, alerts.

## 2. Rules the UI must follow

From the spec and the guardrails in [project-plan.md](project-plan.md#scientific-guardrails):

- Say "hotspots" or "fire activity" for counts. Never "fires" or "burned area".
- Sum cells first, then compute medians and anomalies. Never average per-cell anomalies.
- Estimates only at L2 or coarser. No sub-L2 precision for estimated values.
- Never show an index or z-score as a probability of fire.
- Show sensor, period, unit and source on every chart and map.
- Missing is never zero. An absent row is "no detection recorded", not "no fire".
- AI-generated images need a visible watermark.

## 3. Current structure (branch `feat/app-skeleton`)

```text
app/
├── backend/
│   ├── astro_dashboard/main.py   FastAPI: /healthz, serves the built frontend and the API
│   └── tests/                    backend tests (health check)
├── frontend/
│   ├── package.json              React, Vite, TypeScript (scripts: dev, build, typecheck, preview)
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx              React entry point
│       ├── App.tsx               placeholder: shows API status by calling /healthz
│       └── styles.css            temporary styles (replaced by styles/ on feat/design-system)
├── Dockerfile                    stage 1: Node 24 builds the frontend; stage 2: Python 3.12 + uv runs FastAPI
├── .dockerignore
├── pyproject.toml                standalone uv project (not a root workspace member)
└── uv.lock
```

- The container serves the Vite build (`frontend/dist`) from the FastAPI process, on `$PORT`. One image, one
  Cloud Run service.
- Runs as non-root (UID 10001), stateless, no secrets, no `.env`. Container contract:
  [deploy/cloudrun/README.md](../deploy/cloudrun/README.md).
- The frontend currently has no map, no chart and no data calls beyond `/healthz`.

### Frontend commands

```bash
cd app/frontend
npm ci              # install locked dependencies
npm run dev         # Vite dev server
npm run typecheck   # tsc --noEmit
npm run build       # production build into dist/
```

## 4. Stack

Decided in the diary (`DECISION`, 22:07 UTC, Guilherme Martins): **React + Vite + TypeScript**, SPA served by the
FastAPI container. Rejected alternatives in the same entry: Angular (more setup for the same result) and MapLibre
(heavier setup for drawing).

| Concern | Choice | Status |
|---------|--------|--------|
| Framework | React 19 | Decided, in `package.json` |
| Build | Vite 8, `@vitejs/plugin-react` | In `package.json` |
| Language | TypeScript | In `package.json` |
| Map and drawing | Leaflet + leaflet-draw (rectangle draw, lat/lon bounds on L2 cells) | Decided, **not yet installed** |
| Charts | Not chosen in the files reviewed | Open |
| Styling | Plain CSS custom properties (see section 5), no Tailwind | Tokens on `feat/design-system`, not merged |

**Open point:** the decision entry records that Guilherme answered it, and that Cleber's confirmation is not yet
in the diary. Until it is, the stack stays as logged; reversing it needs a new `DECISION`.

## 5. Design system

Source of truth: [`docs/design-system.md`](design-system.md) on branch `feat/design-system`, commit `22eaa5f`
(author Guilherme Martins). It is not merged into `feat/app-skeleton` yet.

**Layers** (plain CSS, no build step for tokens):

| File | Layer | Rule |
|------|-------|------|
| `primitives.css` | Primitive | Raw values. The only file allowed to hold raw values |
| `semantic.css` | Semantic | Purpose aliases (`--color-surface`, `--color-text-secondary`). Light default, dark overrides |
| `viz.css` | Data viz | Every chart and map color (`--viz-seq-*`, `--viz-div-*`, `--viz-series-*`, marking) |
| `components.css` | Component | Component tokens (`--card-*`, `--tooltip-*`) and their rules |
| `index.css` | Entry | Imports the layers in order; base element styles |

**Color jobs** (each color does one job; text never wears a series color):

- **Sequential (magnitude):** `--viz-seq-1` (least) to `--viz-seq-7` (most). Blue ramp. Dark mode reverses it, so
  more activity is always the lighter end on the dark background. Used by calendar heatmap and map cells.
- **Diverging (polarity):** `--viz-div-neg-1..4`, `--viz-div-mid`, `--viz-div-pos-1..4`. Blue and orange arms, for
  anomaly mode (below or above the historical median).
- **Categorical (identity):** `--viz-series-1..3` for trend lines: harmonized, raw Aqua, raw S-NPP.
- **Status (UI state only):** `--color-status-*`. Always with an icon and a label. Never used for data.

**Dark mode** is declared twice on purpose: under `@media (prefers-color-scheme: dark)` (guarded by
`:root:where(:not([data-theme="light"]))`) and under `:root[data-theme="dark"]`, so an explicit toggle wins both ways.

**Marking rules:** estimated, partial and no-data each have their own marking in `viz.css`. Estimated months use
hatch or outline and a legend entry ("estimated from MODIS" vs "observed by VIIRS").

## 6. Skills and AI tools

- **In the repo:** no skills are configured. There is no `.claude/` folder.
- **In the developer's local Claude Code environment (not in the repo):** `design`, `design-system`, `ui-styling`,
  `ui-ux-pro-max`, `slides`, `banner-design`, `brand`. They may help with tokens, palette checks and UI review.
  - `ui-styling` is built around shadcn/ui, which is React-based. Using it would not change the decided stack, but
    it would add a component library, which needs a `DECISION`.
  - Any AI-generated code, data or image must be acknowledged in [resources.md](resources.md#ai-usage) and in the
    submission. Those rules are in [challenge/official-requirements.md](challenge/official-requirements.md#ai-super-intelligence-rules).
- **AI usage log:** the table in `docs/resources.md#ai-usage` is empty on `feat/app-skeleton`. It must be filled as
  AI-generated work lands.

## 7. Status

| Item | Owner | Status |
|------|-------|--------|
| D1 skeleton: FastAPI `/healthz`, React placeholder, Dockerfile | Guilherme + Cleber | ✅ Done (`72d91ed`) |
| Design system: tokens, color jobs, docs | Guilherme | ✅ Done on `feat/design-system` (`22eaa5f`), not merged |
| Merge design system into `feat/app-skeleton` | Guilherme + Cleber | ⬜ Pending |
| Frontend framework confirmed by Cleber | Cleber | ⬜ Pending (diary note, 22:07 UTC) |
| D2 data access (read `calendar`, sum by area, median, anomalies) | Guilherme + Cleber | ⬜ Not started. Mock calendar is in `main` |
| D3 map with L2 cells, rectangle draw, lat/lon bounds | Guilherme | ⬜ Not started. Leaflet not installed yet |
| D4 calendar heatmap, colorblind-safe, estimated months marked, legend | Cleber | ⬜ Not started. Checkpoint A is Sat 23:00 |
| Chart library for D4 and D9 | Cleber | ⬜ Not chosen. Decide before D4 |
| D5 "this month vs median" card and date selector | Cleber | ⬜ Not started (Sun 02:00) |
| D6 CSV download | Guilherme + Cleber | ⬜ Not started (Sun 02:00) |
| D7 map and calendar linked by shared state | Guilherme | ⬜ Not started |
| D8 first Cloud Run deploy | Guilherme + Cleber, Kali approves | ⬜ Not started (Sun 09:00) |
| D9 should-haves | Cleber + Guilherme | ⬜ Not started (Sun 15:00) |
| D10 "how to read" panel | Jean | ⬜ Not started |
| D12 final deploy, screenshots | Guilherme + Cleber, Jean | ⬜ Not started (Sun 18:00) |

## 8. Open items for the frontend

1. Cleber confirms the React + Vite + TypeScript stack in the diary.
2. Choose the chart library (or a hand-written SVG heatmap) before D4.
3. Merge `feat/design-system` into `feat/app-skeleton`, after agreeing with Guilherme.
4. Install Leaflet and leaflet-draw when D3 starts.
5. Fill the AI usage table in `docs/resources.md`.
6. Confirm the Checkpoint C time (11:00 in `timeline.md`, 15:00 in `tasks.md`).
