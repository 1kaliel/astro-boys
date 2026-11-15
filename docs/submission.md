# Submission: project page fields

The text of the Space Apps project page, as saved on the form on 15 November 2026 at 19:19 Brasília time
(22:21 UTC entry in the [diary](diary/2026-11-15.md)). Saved, **not yet submitted**. The fields are the ones of
the official [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/). Every
number below comes from https://github.com/1kaliel/astro-boys/blob/main/docs/methodology.md or the live app. Text drafted with an AI assistant from the team's
documents; the team reviews and owns it.

**Still open:** the demo link (S2, the only empty required field); Mateus confirming how the FIREWATCHER logo was
made; the private-window test (S5); "Submit for Judging" (S6).

## How the form is laid out

The form differs from the guide in three places, so this page follows the form:

| Form field | Control | What was entered |
|------------|---------|------------------|
| Project Name | text | `FIREWATCHER` |
| Summary | text, 1,500 characters at most (50 to 200 words suggested) | the high-level summary below (1,306 characters) |
| Project Demonstration | one URL | empty until S2 |
| Project | one URL | the web application |
| Project Details | rich text | the detailed description below, including its last two sections |
| Use of Super Intelligence (SI) | checklist, no text | five options, listed below |
| NASA Data | list of links (text and URL) | 9 links, listed below |
| Space Agency Partner & Other Data | list of links, 25 at most | 25 links, listed below |
| Agree to Terms and Conditions; Confirm All Work is Original | two checkboxes | ticked by Kali |

Because the form has no text field for the AI statement, the FIRMS acknowledgement or the paper citations, they
are the last two sections of Project Details. The link fields cut a URL at a closing parenthesis, so the DOI of
Giglio et al. (2003) is entered with `%28` and `%29`.

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

### NASA data, acknowledgement and references

All detections come from NASA FIRMS (Fire Information for Resource Management System), part of NASA LANCE: MODIS
Collection 6 / 6.1 active fire detections (MCD14ML), Terra and Aqua, 2000–2025; VIIRS 375 m active fire product,
Suomi NPP (VNP14IMG), 2012–2026, and NOAA-20 (VJ114IMG), 2018–2026; near-real-time VIIRS files (VNP14IMGTDL_NRT,
VJ114IMGTDL_NRT) for August to November 2026. NASA and NOAA mission notices on satellite outages and orbit
changes were used to check the gaps found in the data. The published calendar uses the Brazil country files
clipped to the Northeast; the experimental preview on the landing page uses the same files for all of Brazil.

We acknowledge the use of data from NASA LANCE FIRMS (https://earthdata.nasa.gov/firms), part of the NASA Earth
Science Data and Information System (ESDIS). No data from other space agencies is used. NASA does not endorse
this project.

Algorithm references: Giglio et al. (2003), MODIS contextual fire detection; Schroeder et al. (2014), VIIRS 375 m
active fire product; Twedt et al. (2023), MODIS orbit drift; Giglio, Schroeder and Hall, MODIS Collection 6 / 6.1
Active Fire Product User's Guide. Basemap: OpenFreeMap, © OpenMapTiles, data from OpenStreetMap contributors
(ODbL). Font: Instrument Serif (SIL OFL 1.1). Product DOIs, the LANCE disclaimer and every library with its
license: https://github.com/1kaliel/astro-boys/blob/main/docs/resources.md

### Use of AI tools

AI tools were used to speed up the work, not to decide how to solve the challenge.

- **What AI did:** wrote and tested code under the direction of team members (data pipeline, calibration and
  validation code, the web application including the landing page and the explorer redesign), ran checks and
  reproductions, reviewed pull requests, structured and edited documentation in English, and drafted texts such
  as this page from the team's own documents.
- **What the team did:** chose the challenge and the approach, proposed the method and its improvements (the
  transfer function with a background term, the gap mask, Terra as a witness, the reconciliation with regional
  totals, the blind final test), decided every trade-off recorded in the diary, and reviewed the results.
- **Tools:** Claude Code (Anthropic) and Codex (OpenAI) as coding assistants, and chat assistants for
  structuring and translating notes.
- **Where it is marked:** AI-assisted code and documents are listed per task in the repository
  (https://github.com/1kaliel/astro-boys/blob/main/docs/resources.md#ai-usage), and the diary entries say when a step was done with an AI assistant.
- **No AI-generated data:** every number comes from NASA FIRMS detections processed by the pipeline; the charts
  are drawn from that data; the screenshots are captures of the running site.
- **Plan and research notes:** the team's first plan and research notes were written by team members; chat
  assistants helped structure, consolidate and translate them into English (`docs/project-plan.md`,
  `docs/spec/`). The choices in them are the team's, recorded as DECISION entries in the diary.

The earlier draft of the fifth point also said "no AI-generated images, audio or video". That part is left out
until Mateus confirms how the logo was made; the one synthetic table (`astro-fire mock-calendar`) was used only
to build screens and is labeled as synthetic.

## Use of Super Intelligence (SI)

A checklist on the form, kept for data collection and not shown to the judges. Ticked:

- [x] Research or Information Gathering
- [x] Data Analysis and Interpretation
- [x] Coding, Debugging, or Troubleshooting
- [x] Writing, Editing, or Translation
- [x] Visual Design or Image Creation (the landing page and explorer layout were built with an AI assistant)
- [ ] Ideation or Brainstorming
- [ ] Building SI/ML Into the Project
- [ ] Presentation, Video, or Audio (tick it if the demo deck was made with AI)
- [ ] Other Project-Related SI Use

The written statement is the "Use of AI tools" section of the detailed description above.

## NASA data

Nine links, in this order:

| # | Link text | Link URL |
|---|-----------|----------|
| 1 | NASA FIRMS (Fire Information for Resource Management System) | <https://firms.modaps.eosdis.nasa.gov/> |
| 2 | MODIS Collection 6 / 6.1 Active Fire Detections (MCD14ML), Terra and Aqua: FIRMS country files | <https://firms.modaps.eosdis.nasa.gov/country/> |
| 3 | VIIRS 375 m Active Fire Product, Suomi NPP (VNP14IMG V002) | <https://doi.org/10.5067/VIIRS/VNP14IMG.002> |
| 4 | VIIRS 375 m Active Fire Product, NOAA-20 (VJ114IMG V002) | <https://doi.org/10.5067/VIIRS/VJ114IMG.002> |
| 5 | VIIRS S-NPP 375 m Active Fire, near real time (VNP14IMGTDL_NRT) | <https://doi.org/10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002> |
| 6 | VIIRS NOAA-20 375 m Active Fire, near real time (VJ114IMGTDL_NRT) | <https://doi.org/10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002> |
| 7 | MODIS Collection 6 and 6.1 Active Fire Product User's Guide | <https://earthdata.nasa.gov/s3fs-public/2023-09/MODIS_C6_C6.1_Fire_User_Guide_1.0.pdf> |
| 8 | NASA Earthdata alerts and outages (satellite gap notices) | <https://www.earthdata.nasa.gov/data/alerts-outages> |
| 9 | NASA LANCE disclaimer | <https://www.earthdata.nasa.gov/data/projects/lance/disclaimer> |

## Space agency partner data and other references

No data from other space agencies is used. Twenty-five links, the most the form takes, in this order:

| # | Link text | Link URL |
|---|-----------|----------|
| 1 | FIREWATCHER credits: every source, library, license and AI use | <https://github.com/1kaliel/astro-boys/blob/main/docs/resources.md> |
| 2 | Giglio et al. (2003), An enhanced contextual fire detection algorithm for MODIS | <https://doi.org/10.1016/S0034-4257%2803%2900184-6> |
| 3 | Schroeder et al. (2014), The New VIIRS 375 m active fire detection data product | <https://doi.org/10.1016/j.rse.2013.12.008> |
| 4 | Twedt et al. (2023), Impact of satellite orbit drift on MODIS Earth scene observations (NASA NTRS) | <https://ntrs.nasa.gov/citations/20240001409> |
| 5 | OpenFreeMap basemap | <https://openfreemap.org/> |
| 6 | OpenMapTiles | <https://www.openmaptiles.org/> |
| 7 | OpenStreetMap contributors (ODbL) | <https://www.openstreetmap.org/copyright> |
| 8 | Instrument Serif font (SIL OFL 1.1) | <https://fonts.google.com/specimen/Instrument+Serif> |
| 9 | Python | <https://www.python.org/> |
| 10 | uv | <https://docs.astral.sh/uv/> |
| 11 | DuckDB | <https://duckdb.org/> |
| 12 | Matplotlib (magma colormap) | <https://matplotlib.org/> |
| 13 | FastAPI | <https://fastapi.tiangolo.com/> |
| 14 | Uvicorn | <https://uvicorn.dev/> |
| 15 | React | <https://react.dev/> |
| 16 | Vite | <https://vite.dev/> |
| 17 | TypeScript | <https://www.typescriptlang.org/> |
| 18 | Base UI | <https://base-ui.com/> |
| 19 | nivo | <https://nivo.rocks/> |
| 20 | MapLibre GL JS | <https://maplibre.org/> |
| 21 | react-map-gl | <https://visgl.github.io/react-map-gl/> |
| 22 | Terra Draw | <https://github.com/JamesLMilner/terra-draw> |
| 23 | Google Cloud (Cloud Storage, Compute Engine, Cloud Build, Cloud Run) | <https://cloud.google.com/> |
| 24 | Claude Code (Anthropic), AI coding assistant | <https://claude.com/claude-code> |
| 25 | Codex (OpenAI), AI coding assistant | <https://openai.com/codex/> |

## Before submitting

- [x] Project name confirmed by Jean: FIREWATCHER.
- [x] Every field except the demo link filled and saved on the form (15 November, 19:19 Brasília), then read
      back from a reloaded page.
- [ ] Demo link added and opened in a private window.
- [ ] Both site and repository links opened in a private window (S5).
- [x] Numbers above checked against https://github.com/1kaliel/astro-boys/blob/main/docs/methodology.md and the live site
      (independent audit, 15 November, 21:30 UTC; recheck only if the data or the site changes).
- [x] AI section confirmed by Kali (recheck against the final demo slides).
- [ ] How the logo was made confirmed by Mateus.
- [x] Both confirmation boxes ticked on the form (Kali).
- [ ] "Submit for Judging" clicked and the confirmation saved (S6).

## S1 editorial review status

Reviewed for Jean with AI assistance against the integrated methodology and task evidence on 15 November 2026.
No new data or scientific results were generated. The project name, NRT qualification, inferred-gap wording,
sensor-transition claim and reproduction scope were corrected. Numerical results were retained from the methodology;
no scientific test or live application test was repeated. Kali and Jean still need to approve the final text,
S2 must supply its final demo link, and S4/S5 acceptance remains separate. S1 stays in progress.
