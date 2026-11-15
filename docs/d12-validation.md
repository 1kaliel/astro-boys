# D12 — screenshot evidence and offline handoff

Prepared for Jean Gustavo on 15 November 2026 with AI assistance. **D12 is in progress.** No deployment or merge was performed. This PR publishes the evidence from the earlier read-only capture session.

> Update, 17:03 UTC: D12 is done. The final deploy (revision `astro-dashboard-00008-m2v`), the offline test and the
> final screenshots 09–20 are recorded in [Final capture on revision 00008](#final-capture-on-revision-00008).

## Live page checked

- URL: https://astro-dashboard-301238386836.us-central1.run.app/
- Model shown by the UI and `/api/version`: `fb-l1-terra-rec-4`.
- Model in the image: `fb-l1-terra-rec-4`.
- Build record: `2026-11-15T09:25:40Z`; calendar 1,838,338 rows, years 2002–2026, 25 files, 73,065,028 bytes; month-to-date 36,079 rows.
- `/api/healthz`: HTTP 200, `status=ok`; `/api/version`: HTTP 200. Full responses and check times are in `../artifacts/screenshots/live-api-checks.json`.
- The API build record identifies the data bundle, not a newly verified application commit or Cloud Run revision. No new deploy is claimed.

## Capture settings

Area: Northeast Brazil (pilot), 4,060 grid cells selected; 3,113 cells with calendar data. Years 2002–2026. Day and night combined. All calendar months. Map selection November 2026, marked partial. UI: 20.4K detections against a median of 22.8K for the same 14 days; 115 of 293 months estimated from MODIS.

Desktop viewport: 1280 × 720, full-page captures where indicated. Phone viewport: 390 × 844, browser emulation only. Viewport override was reset after the capture session. No physical device was tested.

| File under `artifacts/screenshots/` | State | Capture |
|---|---|---|
| `01-dashboard-light-desktop.jpg` | Harmonized / Count / light | Full page; calendar, map, seasonal profile and trend |
| `02-raw-by-sensor-desktop.jpg` | Raw by sensor / Count / light | Full page; includes raw-view notice |
| `03-anomaly-desktop.jpg` | Harmonized / Anomaly / light | Full page; diverging legend and anomaly notice |
| `04-dashboard-dark-desktop.jpg` | Harmonized / Count / dark | Full page; calendar card remains light by design |
| `05-how-to-read-desktop.jpg` | Dark help dialog | Viewport; title and first section visible |
| `06-mobile-top.jpg` | Harmonized / Count / light | Phone viewport; header, filters and KPIs |
| `07-mobile-full-page.jpg` | Harmonized / Count / light | Full page at phone width |
| `08-how-to-read-mobile.jpg` | Light help dialog | Phone viewport; title and first section visible |

These are browser screenshots of the public app, not generated illustrations. The app's own sources, legends and limitations are retained. This PR places the screenshots at the recorded repository paths; integration into main is pending.

## Observations

- Actual screenshots succeeded, including the WebGL map in the full desktop page. The screenshots capture the selected month, not every map interaction.
- Harmonized, raw and anomaly controls changed the visible state. Raw view showed native detections and its notice; anomaly view showed the diverging legend and its notice. Returning to Count and changing theme worked.
- Help opened with its title visible on desktop and phone; five sections were present in the DOM and Close worked. This is a capture-session check, not a replacement for the detailed D10 accessibility tests.
- Phone document width was 390 pixels at a 390-pixel viewport: no whole-page horizontal overflow was measured. This does not certify every internally scrollable element or every device.
- No console error entries were returned at the end of this session; saved in `../artifacts/screenshots/browser-console-errors.json`. This is not a comprehensive runtime/error audit.
- The live raw-view notice and trend paragraph still state the 2012 step categorically as a sensor change rather than qualifying a possible artificial step. The corrected help text is more careful. This wording remains a content-review item, not something silently fixed during capture.
- Dark-theme charts and small legends should be inspected on the presentation display; no formal contrast audit was performed.
- No rectangle drawing, CSV export, service-worker/cache behavior, disconnected-network test, private-window test or container run was performed in this session.

## Offline handoff for Guilherme and Cleber

This machine has no Docker command available and no production calendar/month-to-date Parquet bundle. Consequently no local-container or offline success is claimed.

Use the existing repository instructions in `deploy/cloudrun/README.md` and `docs/cloud/fallback-and-rollback.md`. Prepare the container image and the matching calendar/month-to-date bundle before losing network access. The image's model and loaded model must agree. Check `/api/healthz`, `/api/version`, the area calendar, trend and seasonal profile on the local container.

The frontend map code requests OpenFreeMap styles (`https://tiles.openfreemap.org/styles/positron` and `/dark`) and has a minimal-style fallback if fetching the basemap fails. That source-code fallback has not been exercised in this session: test whether the local grid remains useful without basemap tiles. The deployed CSV source is a cloud bucket; offline CSV requires matching native hotspot data locally and an explicitly configured local path. Do not describe bucket-backed export as offline.

For acceptance, test a fresh browser session while external network access is unavailable, keeping localhost reachable. Record which features work and which are intentionally unavailable; cached map tiles alone are not proof of offline support. Keep native data read-only. Do not use a synthetic calendar as scientific demo evidence.

## Closure checklist

- [x] Eight actual screenshot files created.
- [x] Current model and live health/version response recorded.
- [x] Desktop and phone-width captures prepared.
- [x] Capture manifest with sizes, settings and SHA-256 recorded.
- [ ] This screenshot-evidence PR reviewed and integrated into main.
- [ ] Same container tested locally with real data and no external network.
- [ ] Offline map and CSV limitations verified and documented from that test.
- [ ] Final deploy approved by Kali and performed by the dashboard owners.
- [ ] Captures/version rechecked if the final app/data release changes.

Suggested task-board note: `D12 in progress: Jean prepared eight screenshots at desktop and phone widths, with live model/version and capture manifest. Local container, offline acceptance and final approved deployment remain pending.`

No repository diary entry was added, preserving Jean's earlier instruction. The task must not be marked done from these screenshots alone.

## Correction: real image sizes (2026-11-15, 11:50 UTC)

Found by Guilherme in review, after this record was merged: the sizes in the capture settings above and in the first
version of the manifest are the viewports the capture session recorded, not the sizes of the files. Measured from the
JPEG headers:

| File | Recorded viewport | Image, pixels |
|---|---|---|
| `01-dashboard-light-desktop.jpg` | 1280 × 720, full page | 1264 × 2247 |
| `02-raw-by-sensor-desktop.jpg` | 1280 × 720, full page | 1264 × 2265 |
| `03-anomaly-desktop.jpg` | 1280 × 720, full page | 1264 × 2301 |
| `04-dashboard-dark-desktop.jpg` | 1280 × 720, full page | 1264 × 2247 |
| `05-how-to-read-desktop.jpg` | 1280 × 720 | 1280 × 720 |
| `06-mobile-top.jpg` | 390 × 844 | 375 × 812 |
| `07-mobile-full-page.jpg` | 390 × 844, full page | 374 × 3991 |
| `08-how-to-read-mobile.jpg` | 390 × 844 | 390 × 844 |

- Desktop full-page captures are 1264 px wide, 16 px less than the recorded viewport, which is consistent with a
  vertical scrollbar; this was not confirmed.
- Phone captures 06 and 07 are 375 and 374 px wide, not 390: they show the page at about 375 px. Only 08 is
  390 × 844. The statement above that the document was 390 px wide at a 390 px viewport is therefore not supported by
  captures 06 and 07.
- The manifest now keeps the recorded viewport as `viewport_recorded` and adds the measured `image_pixels`. The
  image files and their SHA-256 values are unchanged.

The captures were not redone: they show the pages they claim to show, and they will be taken again after the final
deploy. Correction made with an AI assistant for Kali.


## Final capture on revision 00008

Captured on 2026-11-15, 16:55 to 17:01 UTC, by Guilherme with an AI assistant (Claude), on the public URL
https://astro-dashboard-301238386836.us-central1.run.app/, revision `astro-dashboard-00008-m2v` (image
`astro-dashboard:3957039`, eighth deploy at 16:50 UTC, approved by Kali). The API does not report the revision: it
comes from the deploy record in the diary, and `/api/version` reports the matching build time (`2026-11-15T16:49:00Z`).
Screenshots 01–08 above stay as they are: they document revision `astro-dashboard-00006-bll`.

**Browser.** Headless Chrome driven by Playwright (`playwright-core` in a temporary folder outside the repository, not a
project dependency), device scale factor 1, software WebGL (SwiftShader), real internet so the OpenFreeMap basemap
loads. Desktop viewport 1280 × 720; phone viewport 390 × 844 with mobile and touch emulation. A fresh browser context
per capture. JPEG quality 85. Before each capture the script waited for the KPIs and charts, for no "Loading" or
"updating" text on the page, and, on desktop, for the map to report its style and tiles loaded and the camera still.

**Settings.** Area Northeast Brazil (study area, 4,060 L2 cells), years 2002–2026, day and night, all months. Map month
November 2026 (the latest, partial) unless a month is picked. Model `fb-l1-terra-rec-4` in the app bar and the calendar
card.

| File under `artifacts/screenshots/` | What it shows | Viewport | Image, pixels |
|---|---|---|---|
| `09-final-overview-desktop.jpg` | Harmonized / Count / light: FIREWATCHER app bar, hero KPI (20.4K so far in November 2026, 11% below the median of the same 14 days), calendar, map, seasonal profile, trend | 1280 × 720, full page | 1280 × 2379 |
| `10-final-overview-dark-desktop.jpg` | Same, dark theme (OS setting); the calendar card stays light by design | 1280 × 720, full page | 1280 × 2379 |
| `11-drilldown-desktop.jpg` | Map card: September 2013 picked in the calendar, cell G083135.16 clicked: 16 L3 sub-cells, the 8 neighbor counts (213 to 612), legend "Native detections, S-NPP (VIIRS), September 2013: not harmonized", 639 detections | 1280 × 720, map card | 406 × 1240 |
| `12-zoom-focus-desktop.jpg` | Map card at zoom 9 over G087133.14: place names above translucent cells, focus outline and chip ("132 VIIRS-equivalent hotspots · November 2026 · Partial month") | 1280 × 720, map card | 406 × 1240 |
| `13-globe-desktop.jpg` | Map card, Globe: whole globe turned to the study area, the study-area box with its label "Study area: Northeast Brazil · data processed only here", and the globe note | 1280 × 720, map card | 406 × 1240 |
| `14-raw-by-sensor-desktop.jpg` | Raw by sensor / Count / light, with the raw-view notice | 1280 × 720, full page | 1280 × 2405 |
| `15-anomaly-desktop.jpg` | Harmonized / Anomaly / light, with the diverging legend and notice | 1280 × 720, full page | 1280 × 2433 |
| `16-final-phone-top.jpg` | Phone, first screen: app bar, filters, hero KPI | 390 × 844 | 390 × 844 |
| `17-final-phone-full.jpg` | Phone, whole page; the map stays folded behind "Show map", as designed on phones | 390 × 844, full page | 390 × 4126 |
| `18-phone-charts.jpg` | Phone, seasonal profile card: January to December on the axis, the usual range, the median and 2026 with the September–November peak | 390 × 844, card | 366 × 565 |
| `19-how-to-read-phone.jpg` | Phone, "How to read this dashboard" open, title and first section | 390 × 844 | 390 × 844 |
| `20-offline-local.jpg` | **Not revision 00008.** The local container run of PR 58 with the external network blocked ([offline record](d12-offline-test.md)): "Basemap unavailable: showing the cells only", same KPIs. Built before the FIREWATCHER name, so the app bar still reads "Hotspot calendar". PNG of 11:35 UTC converted to JPEG | 1280 × 720, full page | 1280 × 2256 |

Full-page and card captures (09–15, 17, 18) are rendered from the top of the page and, for the cards, clipped to the
card, so the sticky app bar is not drawn over them. The map positions in 11 and 12 were set through the MapLibre API
(centre and zoom), not by dragging; the drill-down in 11 is a real mouse click on the cell, after which the app frames
the 3 × 3 block itself. Every capture time, size, setting and SHA-256 is in
[`screenshots-manifest.json`](../artifacts/screenshots/screenshots-manifest.json).

**Checked.**

- `/api/healthz` 200 `ok`; `/api/version` `fb-l1-terra-rec-4` loaded and in the image, 1,838,338 rows, 2002–2026;
  page title "FIREWATCHER: hotspot calendar for Northeast Brazil"; `/favicon.svg` 200; CSV count for 16 cells
  (-41, -10, -40, -9) in 2013: 2,064 rows; `/api/drilldown` G083135.16, September 2013: S-NPP VIIRS, 639 detections,
  subdivided, 9 cells in the 3 × 3 block, 16 L3 cells summing to 639. Checked before (16:53 UTC) and after (17:01 UTC)
  the capture, same answers: [`live-api-checks-00008.json`](../artifacts/screenshots/live-api-checks-00008.json).
- Console: no console errors and no page errors in any capture. Two MapLibre warnings (a sprite icon `circle-11`
  missing from the dark OpenFreeMap style; "Unknown projection name: undefined" when switching to Globe) and, in the
  globe capture, five tile requests cancelled by MapLibre while the view moved:
  [`browser-console-errors-00008.json`](../artifacts/screenshots/browser-console-errors-00008.json).
- No sideways page scroll: document width 1280 at 1280 px and 390 at 390 px.
- Each image was looked at.

**Retakes.** The first captures of 11, 12 and 13 were element screenshots: Playwright scrolled the page and the sticky
app bar and filter bar were drawn across the map card. They were retaken from the top of the page, clipped to the card,
and 12 was moved from a cell on the study-area edge (G087131.02) to an inland one (G087133.14). Capture 18 was retaken
the same way for consistency. The discarded attempts' console entries are kept in the console file.

**Not verified.** A physical phone (390 px is browser emulation only), Safari and Firefox (Chrome only), a screen
reader, a slow network, the dark theme at phone width, image downloads and the CSV download in this session.

The offline fallback (local container from `data/`, external network blocked) is recorded in
[d12-offline-test.md](d12-offline-test.md) and runs with `deploy/local/run-offline.sh`.
