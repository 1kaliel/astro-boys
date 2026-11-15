# D12 — screenshot evidence and offline handoff

Prepared for Jean Gustavo on 15 November 2026 with AI assistance. **D12 is in progress.** No deployment or merge was performed. This PR publishes the evidence from the earlier read-only capture session.

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

## Correction: real image sizes (2026-11-15, 12:25 UTC)

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

