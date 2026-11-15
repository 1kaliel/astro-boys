# Submission draft: project page fields

Draft for Kali and Jean to review and paste into the Space Apps project page (tasks S1 and S4). The fields are the
ones listed in [challenge/official-requirements.md](challenge/official-requirements.md#project-page-fields). Every
number below comes from [methodology.md](methodology.md) or the live dashboard; check them again if the data or
the site changes before submitting. Text drafted with an AI assistant from the team's documents; the team reviews
and owns it.

**Still open before this can be pasted:** the project name, the demo link (S2), a last read by Kali and Jean, and
the point marked "to confirm" in the AI section.

## Project name

_To be chosen by the team._ The live site is titled "Hotspot calendar".

## High-level summary

Two generations of NASA sensors have recorded active-fire hotspots for more than twenty years, but they cannot be
compared directly: over the same fire activity, VIIRS detects six to seven times as many hotspots as Aqua MODIS in
our study area, so the raw record jumps in 2012 for a reason that has nothing to do with fire. We built a method that
puts the MODIS years on the VIIRS scale, cell by cell and month by month, and a web application that shows the
result as a burning calendar. For Northeast Brazil it gives one consistent monthly series from July 2002 to today,
in which every estimated month is labeled and carries a 90% interval. The user picks an area and a period and sees
which months and years had the most fire activity, how the current month compares with its history, and where the
anomalies are, and can download the underlying NASA detections. The method was tested on years it had never seen
and beats the simple conversions; its limits are stated next to the results.

## Link to project demo

_To be added (S2): a video of at most 30 seconds or at most 7 slides, in English._

## Link to final project

- Web application: <https://astro-dashboard-301238386836.us-central1.run.app>
- Code, data pipeline and documentation: <https://github.com/1kaliel/astro-boys>

## Detailed description

### What it does

The application is a burning-activity calendar for Northeast Brazil built on NASA FIRMS hotspot detections.

- **Calendar:** one row per year and one square per month, from 2002 to the current month, on a single
  VIIRS-equivalent scale. Months estimated from MODIS are marked; partial months and months without data are shown
  as such, never as zero.
- **Area and period:** the whole region, a rectangle drawn on the map, coordinates typed in, or the visible map
  area; any range of years; all detections, day only or night only.
- **Comparisons:** the current month against the median of the same days in earlier years; an anomaly view
  (how unusual each month was for its place and season); a seasonal profile with the usual range; a long-term
  trend chart that shows the raw MODIS and VIIRS counts beside the harmonized series.
- **Downloads:** the native NASA detections for the selected area and dates as CSV, with sensor, satellite and
  product version in every row.
- **Explanations in place:** a "How to read" panel with what is shown, its limitations and its sources.

### How it works

1. **Data.** MODIS (Aqua and Terra) and VIIRS (Suomi NPP and NOAA-20) detections from NASA FIRMS are normalized,
   filtered to presumed vegetation fires of nominal or high confidence, and counted per 0.25° cell, local solar
   month, day or night, and satellite. Sensor, satellite and product version stay in every row.
2. **Gaps.** Days when a satellite was not observing are detected from the data and checked against NASA and NOAA
   notices. Incomplete months are flagged and are not treated as low fire activity.
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
- A clean clone of the repository rebuilds the published dataset from the raw NASA files in under six minutes,
  with identical counts.

### What it does not do

- A hotspot is a satellite detection, not a fire, a number of fires or a burned area.
- The series is the early-afternoon and night view of the satellites, not all fire activity of the day.
- Estimates before 2012 rest on the assumption that the 2012–2019 relation held earlier; there is no VIIRS
  observation to test that directly.
- Since 2022 the Aqua orbit has drifted to later overpass times, and the conversion is about 20% high for
  2024–2025. This does not enter the product, which uses observed VIIRS from 2012.
- The 2026 months come from near-real-time data and are provisional.
- It is an exploratory prototype: no forecast, no risk level, not for emergency decisions.

### Benefits and goals

Land managers, researchers and fire services can compare any month with two decades of history on one scale,
without the false jump of 2012, and can see how certain each estimated value is. The method is documented and
reproducible, so it can be extended to other regions with the same NASA files; the Northeast of Brazil is the
pilot.

### Tools and languages

Python 3.12, DuckDB and partitioned Parquet for the pipeline (managed with uv, tested with pytest); FastAPI for
the backend; TypeScript, React and Vite for the frontend, with nivo and MapLibre GL JS; Google Cloud (Cloud
Storage, a Compute Engine VM, Cloud Build and Cloud Run). Full list with licenses: [resources.md](resources.md).

## Use of Super Intelligence (AI)

AI tools were used to speed up the work, not to decide how to solve the challenge.

- **What AI did:** wrote and tested code under the direction of team members (data pipeline, calibration and
  validation code, the web application), ran checks and reproductions, reviewed pull requests, structured and
  edited documentation in English, and drafted texts such as this page from the team's own documents.
- **What the team did:** chose the challenge and the approach, proposed the method and its improvements (the
  transfer function with a background term, the gap mask, Terra as a witness, the reconciliation with regional
  totals, the blind final test), decided every trade-off recorded in the diary, and reviewed the results.
- **Tools:** AI coding assistants and chat assistants; the tool used for each task is recorded in
  [resources.md](resources.md#ai-usage).
- **Where it is marked:** AI-assisted code and documents are listed per task in the repository
  ([resources.md](resources.md#ai-usage)), and the diary entries say when a step was done with an AI assistant.
- **No AI-generated data, images, audio or video:** every number comes from NASA FIRMS detections processed by
  the pipeline; the charts are drawn from that data; the screenshots are captures of the running site. The one
  synthetic table (`astro-fire mock-calendar`) was used only to build screens and is labeled as synthetic.
- **To confirm by Kali before submitting:** how the team's first plan and research notes, which were drafted with
  chat assistants, are described here.

## NASA data

All detections come from **NASA FIRMS** (Fire Information for Resource Management System), part of NASA LANCE:

- MODIS Collection 6 / 6.1 active fire detections (MCD14ML), Terra and Aqua, 2000–2025.
- VIIRS 375 m active fire product, Suomi NPP (VNP14IMG), 2012–2026.
- VIIRS 375 m active fire product, NOAA-20 (VJ114IMG), 2018–2026.
- Near-real-time VIIRS files (VNP14IMGTDL_NRT, VJ114IMGTDL_NRT) for August to November 2026.

Also used: NASA and NOAA mission notices on satellite outages and orbit changes, to check the gaps found in the
data. Product DOIs and the FIRMS acknowledgment and disclaimer: [resources.md](resources.md#data-sources-used).

## Space agency partner data and other references

No data from other space agencies is used in the published product. Everything else we used (libraries, basemap,
algorithm papers, tools, AI assistance) is listed with its license or citation in [resources.md](resources.md):

- Algorithm references: Giglio et al. (2003) for MODIS detections; Schroeder et al. (2014) for VIIRS 375 m
  detections; Twedt et al. (2023) for the MODIS orbit drift.
- Basemap: OpenFreeMap, © OpenMapTiles, data from OpenStreetMap contributors.
- Software: DuckDB, FastAPI, React, Vite, nivo, MapLibre GL JS, Terra Draw, Base UI and the others in the table.

## Before submitting

- [ ] Project name chosen.
- [ ] Demo link added and opened in a private window.
- [ ] Both site and repository links opened in a private window (S5).
- [ ] Numbers above checked against [methodology.md](methodology.md) and the live site.
- [ ] AI section confirmed by Kali.
- [ ] Both confirmation boxes ticked on the form.
