# Resources and credits

Space Apps asks teams to credit every data source and tool. Add each one **the moment we use it**.
Before submitting, check each product's documentation for its required citation and terms.

## Data sources used

| Source | What we used | URL | License / citation | Added by |
|--------|--------------|-----|--------------------|----------|
| NASA FIRMS, MODIS Collection 6 / 6.1 active fire / hotspot detections (MCD14ML, standard processing), Terra and Aqua | Yearly country files 2000–2025 (`modis_{YYYY}_all_countries.zip`), Brazil, clipped to the Northeast | https://firms.modaps.eosdis.nasa.gov/country/ | MODIS Collection 6 / 6.1 Hotspot / Active Fire Detections MCD14ML distributed from NASA FIRMS. https://doi.org/10.5067/FIRMS/MODIS/MCD14ML. The `version` column in the Brazil files reads `6.2` (2003–2017), `6.03` (2018–2022) and `61.03` (2023–2025): Collection 6 until 2022, Collection 6.1 from 2023 (first and last rows of each file checked) | Justino |
| NASA FIRMS, VIIRS 375 m active fire product, Suomi NPP (VNP14IMG, standard processing; VNP14IMGTDL_NRT, near real time) | Yearly country files 2012–2025; area API 2026 (`VIIRS_SNPP_SP` to 2026-07-31, `VIIRS_SNPP_NRT` to 2026-11-02) | https://firms.modaps.eosdis.nasa.gov/ | NASA VIIRS Land Science Team (2020). VIIRS (S-NPP) I Band 375 m Active Fire Product NRT (Vector data). NASA LANCE MODIS at the MODAPS. https://doi.org/10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002. Standard product: VNP14IMG V002, https://doi.org/10.5067/VIIRS/VNP14IMG.002 | Justino |
| NASA FIRMS, VIIRS 375 m active fire product, NOAA-20 / JPSS-1 (VJ114IMG, standard; VJ114IMGTDL_NRT, near real time) | Yearly country files 2018–2025; area API 2026 (`VIIRS_NOAA20_SP` to 2026-07-31, `VIIRS_NOAA20_NRT` to 2026-11-14) | https://firms.modaps.eosdis.nasa.gov/ | NASA VIIRS Land Science Team (2020). VIIRS NOAA-20 (JPSS-1) 375 m I-Band Active Fire Product NRT (Vector Data). NASA LANCE MODIS at the MODAPS. https://doi.org/10.5067/FIRMS/VIIRS/VJ114IMGT_NRT.002. Standard product: Giglio, L. (2024). VIIRS/JPSS1 Active Fires 6-Min L2 Swath 375m V002. NASA LP DAAC. https://doi.org/10.5067/VIIRS/VJ114IMG.002 | Justino |

All three are NASA data, accessed through FIRMS (the challenge's listed resource). Download log with dates:
`data/raw/SOURCES.md`; input checksums are in the ingest manifests. See [data-access.md](data-access.md).

### How to cite NASA FIRMS (use in the app, the project page and the CSV download)

- **Acknowledgement**, adapted from the FIRMS FAQ (which words it for imagery): We acknowledge the use of data
  from the NASA LANCE FIRMS (https://earthdata.nasa.gov/firms), part of the NASA Earth Science Data and
  Information System (ESDIS).
- **Short credit for captions and the app footer:** "Data: NASA FIRMS (MODIS Collection 6/6.1, VIIRS 375 m
  Collection 2)", with a link to https://earthdata.nasa.gov/firms.
- **Disclaimer (required when redistributing FIRMS data, as our CSV download does):** link the
  [LANCE Disclaimer](https://www.earthdata.nasa.gov/data/projects/lance/disclaimer). In short: the data come
  without warranty and are not meant for tactical or local-scale decisions. The same text ships in
  `AttributesReadme.txt` inside every FIRMS yearly zip.
- **Product DOIs:** as in the table above.
- NASA does not endorse this project. No NASA logos are used or modified.

Sources for this guidance: [FIRMS FAQ](https://www.earthdata.nasa.gov/data/tools/firms/faq);
[LANCE Disclaimer](https://www.earthdata.nasa.gov/data/projects/lance/disclaimer);
[VJ114IMGTDL_NRT catalog entry](https://www.earthdata.nasa.gov/data/catalog/lancemodis-vj114imgtdl-nrt-2);
[VNP14IMGTDL_NRT catalog entry](https://www.earthdata.nasa.gov/data/catalog/lancemodis-vnp14imgtdl-nrt-2);
[VNP14IMGTDL_NRT product page](https://modaps.modaps.eosdis.nasa.gov/services/about/products/viirs-land-c2-nrt/vnp14imgtdl_nrt.html).

### Algorithm references (cite in the methodology and the project page)

| Reference | Used for |
|-----------|----------|
| Giglio, L., Descloitres, J., Justice, C. O., Kaufman, Y. J. (2003). An enhanced contextual fire detection algorithm for MODIS. *Remote Sensing of Environment*, 87, 273–282. https://doi.org/10.1016/S0034-4257(03)00184-6 | How MODIS detections are made (listed in the FIRMS FAQ) |
| Schroeder, W., Oliva, P., Giglio, L., Csiszar, I. A. (2014). The New VIIRS 375 m active fire detection data product: algorithm description and initial assessment. *Remote Sensing of Environment*, 143, 85–96. https://doi.org/10.1016/j.rse.2013.12.008 | How VIIRS 375 m detections are made (listed in the FIRMS FAQ) |
| Twedt, K., Xiong, X., Geng, X., Wilson, T., Mu, Q. (2023). Impact of satellite orbit drift on MODIS Earth scene observations used in calibration of the reflective solar bands. Proc. SPIE. NASA NTRS 20240001409. https://ntrs.nasa.gov/citations/20240001409 | Dates of the last Terra and Aqua orbit maneuvers |

## Tools and libraries used

| Tool | Purpose | License |
|------|---------|---------|
| [DuckDB](https://duckdb.org/) | Pipeline query engine (CSV → Parquet, out-of-core); dashboard backend (area sums over `calendar/v1`) | MIT |
| [Matplotlib](https://matplotlib.org/) | Static figures for the write-up and the demo (`uv sync --extra figures`) | Matplotlib license (BSD-style) |
| [uv](https://docs.astral.sh/uv/) | Python env and locked dependencies | Apache-2.0 / MIT |
| [Python](https://www.python.org/) 3.12 | Pipeline language | PSF |
| [gcsfs](https://github.com/fsspec/gcsfs) | Optional `gs://` access | BSD-3-Clause |
| [pytest](https://pytest.org/), [Ruff](https://docs.astral.sh/ruff/) | Tests, lint | MIT |
| [gitleaks](https://github.com/gitleaks/gitleaks) | CI secret scan | MIT |
| Google Cloud (Cloud Storage, Compute Engine, Cloud Run, Artifact Registry) | Shared data, pipeline VM, dashboard hosting | Commercial service |
| GitHub, GitHub Actions | Code hosting, CI | Commercial service |
| [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/) | Dashboard backend and server | MIT; BSD-3-Clause |
| [React](https://react.dev/), [Vite](https://vite.dev/), [TypeScript](https://www.typescriptlang.org/) | Dashboard frontend, build, types | MIT; MIT; Apache-2.0 |
| [Base UI](https://base-ui.com/) (`@base-ui/react`) | Unstyled accessible UI primitives (tooltip, select, tabs, dialog, number field), styled with our tokens | MIT |
| [nivo](https://nivo.rocks/) (`@nivo/heatmap` 0.99.0) | Year x month grid of the burning calendar; cells are drawn by our own component | MIT |
| [Vitest](https://vitest.dev/) | Frontend unit tests (calendar model) | MIT |

## References

| Reference | Used for |
|-----------|----------|
| NASA FIRMS, active fire data attributes (MODIS and VIIRS): https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs | Field meanings |
| NASA FIRMS FAQ: https://www.earthdata.nasa.gov/data/tools/firms/faq | NRT vs standard processing; confidence classes |
| FIRMS `AttributesReadme.txt` (inside every yearly zip) | Projection, citation and disclaimer guidance |
| Li, F., et al. (2018). Comparison of Fire Radiative Power Estimates From VIIRS and MODIS Observations. *JGR Atmospheres*. https://doi.org/10.1029/2017JD027823 | Near-simultaneous MODIS–VIIRS comparison (to read and confirm before citing in the submission) |
| NASA Earthdata notices on the MODIS → VIIRS transition and the end of S-NPP observations (links in [data-access.md](data-access.md#sensor-timeline)) | Sensor timeline |

## AI usage

**Required by the rules.** The submission must say how AI tools were used, and AI-generated code and data must be
acknowledged in descriptive text and metadata (images/video need a visible watermark). Record each use here as it
happens. See [challenge/official-requirements.md](challenge/official-requirements.md#ai-super-intelligence-rules).

| What | Tool | Notes |
|------|------|-------|
| References list and FIRMS citation guidance (task S3, `docs/resources.md`) | Claude (Anthropic) | Drafted for Justino from the FIRMS FAQ, the LANCE disclaimer and the product catalog pages; every URL and DOI was opened and checked; Justino reviews |
| Historical FIRMS ingestion and monthly aggregation implementation, regression fixture, and runbook | Codex | Assisted with pipeline code and verification. Historical detections come from NASA FIRMS. See [historical batch](historical-batch.md). |
| Burning calendar (task D4): `app/frontend/src/features/calendar/`, `src/data/calendarSource.ts`, `src/data/useCalendar.ts`, `src/styles/calendar.css`, unit tests, and the script that builds the fixture | Claude Code (Claude Sonnet 5.5, Anthropic) | Code written with AI assistance for Cleber, the task owner. The solution idea (a year x month heatmap of hotspot counts) comes from the challenge brief, not from AI. The fixture `app/frontend/src/data/fixtures/calendar-mock.json` is **synthetic** (from `astro-fire mock-calendar`), for building screens only |
| Historical dashboard calendar assembly, regression fixture, and verification | Codex | Implemented the H7 integration using the team's calibration functions, factors and coverage rules. |
| Calendar data access (task D2): `app/backend/astro_dashboard/{calendar,api}.py`, `app/backend/tests/test_calendar_api.py`, the API client in `app/frontend/src/data/`, and the app README section | Claude Code (Claude Sonnet 5.5, Anthropic) | Code written with AI assistance for Cleber, the task owner. The rules (sum cells first, absent rows, pending intervals) come from the data contract written by the Harmonization team. Checked against direct sums of the real `calendar/v1` |
