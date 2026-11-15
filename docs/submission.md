# Submission draft: project page fields

Draft for Kali and Jean to review and paste into the Space Apps project page (tasks S1 and S4). The fields are the
ones listed in the official [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/). Every
number below comes from https://github.com/1kaliel/astro-boys/blob/main/docs/methodology.md or the live dashboard; check them again if the data or
the site changes before submitting. Text drafted with an AI assistant from the team's documents; the team reviews
and owns it.

**Still open before this can be pasted:** the demo link (S2); Mateus confirming how the FIREWATCHER logo was made
(the AI section says no AI-generated images); a check that the AI section still matches the final demo slides.
Every link below is absolute, so the text can be pasted as it is.

## Project name

FIREWATCHER

## High-level summary

FIREWATCHER is a web application that turns more than two decades of NASA FIRMS MODIS and VIIRS hotspot
detections into one burning-activity calendar. Raw counts from the two instruments cannot be compared: when
VIIRS takes over from MODIS in 2012 the record jumps about ninefold, although the fires did not. We estimate
the earlier MODIS record on a VIIRS-equivalent scale, per 0.25° cell and month, and use observed VIIRS counts
from February 2012 onward. The validated product covers Northeast Brazil from July 2002 to November 2026, with
observations through 14 November. Estimated months are labeled and carry a 90% interval; missing observations
and partial months are marked. In a map-first explorer, users pick an area and a period, compare any month
with its historical median, see anomalies and the seasonal profile, open the daily detections of a month, and
download the detections, the calendar table and the charts. The frozen method passed its pre-set final test:
lower cell-month errors than every simple baseline, and level with the best one on regional totals. The
landing page also previews a first Brazil-wide run of the same method, labeled experimental and not validated.
A hotspot is not a fire count or burned area. This exploratory prototype provides no forecast or risk
assessment.

## Link to project demo

_To be added (S2): a seven-slide deck in English, including title and intro._

## Link to final project

<https://astro-dashboard-301238386836.us-central1.run.app>

(If the form takes only one link, use the app; the repository is the first line of the detailed description.)

## Detailed description

Code, data pipeline and documentation: https://github.com/1kaliel/astro-boys

### What it does

FIREWATCHER has two pages, both open without an account.

- **Landing page:** the story in one screen. An interactive globe plays hotspot activity month by month, a
  chart shows the 2012 jump in the raw record beside the harmonized series, and a short "How it works" explains
  the method. The globe and one chart use a first run over all of Brazil, labeled experimental and not
  validated; a dashed box marks the validated Northeast pilot.
- **Explorer:** a map with a sidebar in three steps (where, when, what). One selected month drives the map,
  the totals and the timeline.
- **Calendar:** one row per year and one square per month, from 2002 to the current month, on a single
  VIIRS-equivalent scale. Months estimated from MODIS are marked; partial months and months without data are
  shown as such, never as zero.
- **Area and period:** the whole region, a state (approximate boxes), a rectangle drawn on the map, typed
  coordinates, or the visible map area; any range of years; all detections, day only or night only. A switch
  shows the harmonized series or the native MODIS or VIIRS counts.
- **Comparisons:** the selected month against the median of the same month in other years (the same days for
  the unfinished month); an anomaly view of how unusual each month was for its place and season; a seasonal
  profile with the usual range; a chart of the raw MODIS and VIIRS counts beside the harmonized series.
- **Day view:** the daily native detections of a month, with the satellite and its overpass times. Daily
  counts are native and labeled as such; the harmonized series stays monthly.
- **Downloads:** the native NASA detections for the selected area and dates as CSV, with sensor, satellite and
  product version in every row; the calendar as a table with intervals and provenance; the charts as SVG or
  PNG.
- **Explanations in place:** a guided tour and an "Understand the data" panel with what a hotspot is, how to
  read each indicator, the sources and the limitations.

### How it works

1. **Data.** MODIS (Aqua and Terra) and VIIRS (Suomi NPP and NOAA-20) detections from NASA FIRMS are normalized,
   filtered to nominal or high confidence and vegetation type where supplied, and counted per 0.25° cell,
   local solar month, day or night, and satellite. NRT files lack type: it stays null and nominal/high untyped
   detections enter provisional counts, which may include non-vegetation sources. Sensor, satellite and
   product version stay in every row.
2. **Gaps.** Likely observation gaps are inferred from detection deficits and compared with available NASA and NOAA
   notices. This is not a complete observation mask and not every gap has independent confirmation.
   Incomplete months are flagged; missing data are not treated as zero activity.
3. **Transfer function.** In 2012–2019, when Aqua MODIS and Suomi NPP VIIRS observed together at nearly the same
   local time, we fit for each cell, month of year and time of day (a) a factor that converts Aqua counts to
   VIIRS-equivalent counts and (b) a background term for the activity VIIRS sees where Aqua sees none. Cells with
   little data borrow strength from their 1° neighborhood. Terra tells the model whether a cell with no Aqua
   detection was active, and each month is reconciled with the regional ratio.
4. **One series.** Before February 2012 the calendar holds estimates from Aqua; from February 2012 it holds
   observed VIIRS counts, with NOAA-20 filling Suomi NPP outages after a measured continuity ratio (1.041).
5. **Uncertainty.** Every estimate carries a 90% interval taken from the errors the method made on years left out
   of the fit.

### How we know it works

- The method was frozen, with a written pass rule, before the test years were opened. The final test (2022–2023)
  was run once.
- Per cell and month, its mean absolute error is 3.46 detections against 4.22 for the best simple conversion, and
  5.33 for raw MODIS counts. On regional monthly totals it is level with the best simple conversion.
- The 90% intervals contained the observed value in 94% of cell-months of the development years.
- A clean-clone reproduction at commit 5286248 rebuilt the published calendar and was audited. Early-years
  and 2026 ingestion were repeated on newer code with matching counts; the complete pipeline was not rerun
  on the latest code. See the reproduction reports linked from
  https://github.com/1kaliel/astro-boys/blob/main/docs/methodology.md#reproducibility-and-evidence-status (reproducibility section).

### What it does not do

- A hotspot is a satellite detection, not a fire, a number of fires or a burned area.
- The series is the early-afternoon and night view of the satellites, not all fire activity of the day.
- Estimates before 2012 rest on the assumption that the 2012–2019 relation held earlier; there is no VIIRS
  observation to test that directly.
- Since 2022 the Aqua orbit has drifted to later overpass times, and the conversion is about 20% high for
  2024–2025. This does not enter the product, which uses observed VIIRS from 2012.
- January–July 2026 use standard processing; August onward uses provisional near-real-time records.
  November is partial through 14 November. NRT records lack type and may include non-vegetation sources.
- It is an exploratory prototype: no forecast, no risk level, not for emergency decisions.

### Benefits and goals

Land managers, researchers and fire services can compare any month with two decades of history on one scale,
with instrument differences addressed and uncertainty shown for estimates. Harmonization does not establish
that every change around a sensor transition is artificial. The method is documented and reproducible, so it can be extended to other regions with the same NASA files.
Northeast Brazil is the validated pilot; a first Brazil-wide run with the same frozen method is shown on the
landing page as an experimental preview (on development years 2020–2021 its cell-month error is 14% below the
best simple conversion; it has not had a blind test).

### Tools and languages

Python 3.12, DuckDB and partitioned Parquet for the pipeline (managed with uv, tested with pytest); FastAPI for
the backend; TypeScript, React and Vite for the frontend, with nivo and MapLibre GL JS; Google Cloud (Cloud
Storage, a Compute Engine VM, Cloud Build and Cloud Run). Full list with licenses: https://github.com/1kaliel/astro-boys/blob/main/docs/resources.md

## Use of Super Intelligence (AI)

AI tools were used to speed up the work, not to decide how to solve the challenge.

- **What AI did:** wrote and tested code under the direction of team members (data pipeline, calibration and
  validation code, the web application including the landing page and the explorer redesign), ran checks and
  reproductions, reviewed pull requests, structured and
  edited documentation in English, and drafted texts such as this page from the team's own documents.
- **What the team did:** chose the challenge and the approach, proposed the method and its improvements (the
  transfer function with a background term, the gap mask, Terra as a witness, the reconciliation with regional
  totals, the blind final test), decided every trade-off recorded in the diary, and reviewed the results.
- **Tools:** Claude Code (Anthropic) and Codex (OpenAI) as coding assistants, and chat assistants for
  structuring and translating notes; the tool used for each task is recorded at
  https://github.com/1kaliel/astro-boys/blob/main/docs/resources.md#ai-usage
- **Where it is marked:** AI-assisted code and documents are listed per task in the repository
  (https://github.com/1kaliel/astro-boys/blob/main/docs/resources.md#ai-usage), and the diary entries say when a step was done with an AI assistant.
- **No AI-generated data, images, audio or video:** every number comes from NASA FIRMS detections processed by
  the pipeline; the charts are drawn from that data; the screenshots are captures of the running site. The one
  synthetic table (`astro-fire mock-calendar`) was used only to build screens and is labeled as synthetic.
- **Plan and research notes:** the team's first plan and research notes were written by team members; chat
  assistants helped structure, consolidate and translate them into English (`docs/project-plan.md`,
  `docs/spec/`). The choices in them are the team's, recorded as DECISION entries in the diary.

## NASA data

All detections come from **NASA FIRMS** (Fire Information for Resource Management System), part of NASA LANCE:

- MODIS Collection 6 / 6.1 active fire detections (MCD14ML), Terra and Aqua, 2000–2025.
- VIIRS 375 m active fire product, Suomi NPP (VNP14IMG), 2012–2026.
- VIIRS 375 m active fire product, NOAA-20 (VJ114IMG), 2018–2026.
- Near-real-time VIIRS files (VNP14IMGTDL_NRT, VJ114IMGTDL_NRT) for August to November 2026.

Also used: NASA and NOAA mission notices on satellite outages and orbit changes, to check the gaps found in the
data. The published calendar uses the Brazil country files clipped to the Northeast; the experimental preview
on the landing page uses the same files for all of Brazil. We acknowledge the use of data from NASA LANCE
FIRMS (https://earthdata.nasa.gov/firms), part of the NASA Earth Science Data and Information System (ESDIS).
Product DOIs and the LANCE disclaimer: https://github.com/1kaliel/astro-boys/blob/main/docs/resources.md#data-sources-used

## Space agency partner data and other references

No data from other space agencies is used. Everything else, with license or citation, is at
https://github.com/1kaliel/astro-boys/blob/main/docs/resources.md

- **Algorithm references:** Giglio et al. (2003), MODIS contextual fire detection; Schroeder et al. (2014),
  VIIRS 375 m active fire product; Twedt et al. (2023), MODIS orbit drift; Giglio, Schroeder and Hall, MODIS
  Collection 6 / 6.1 Active Fire Product User's Guide.
- **Basemap and font:** OpenFreeMap, © OpenMapTiles, data from OpenStreetMap contributors (ODbL); Instrument
  Serif (Google Fonts, SIL OFL 1.1).
- **Pipeline:** Python 3.12, uv, DuckDB, Parquet, gcsfs, Matplotlib (magma colormap), pytest, Ruff, HTTPX,
  Hatchling.
- **Web application:** FastAPI, Uvicorn, React, Vite, TypeScript, Base UI, nivo, MapLibre GL JS, react-map-gl,
  Terra Draw, Vitest, Node.js, Docker.
- **Services:** Google Cloud (Cloud Storage, Compute Engine, Cloud Build, Artifact Registry, Cloud Run),
  GitHub and GitHub Actions, gitleaks.
- **AI tools:** Claude Code (Anthropic), Codex (OpenAI) and chat assistants, as described in the AI section.

## Before submitting

- [x] Project name confirmed by Jean: FIREWATCHER.
- [ ] Demo link added and opened in a private window.
- [ ] Both site and repository links opened in a private window (S5).
- [x] Numbers above checked against https://github.com/1kaliel/astro-boys/blob/main/docs/methodology.md and the live site
      (independent audit, 15 November, 21:30 UTC; recheck only if the data or the site changes).
- [x] AI section confirmed by Kali (recheck against the final demo slides).
- [ ] Both confirmation boxes ticked on the form.

## S1 editorial review status

Reviewed for Jean with AI assistance against the integrated methodology and task evidence on 15 November 2026.
No new data or scientific results were generated. The project name, NRT qualification, inferred-gap wording,
sensor-transition claim and reproduction scope were corrected. Numerical results were retained from the methodology;
no scientific test or live application test was repeated. Kali and Jean still need to approve the final text,
S2 must supply its final demo link, and S4/S5 acceptance remains separate. S1 stays in progress.
