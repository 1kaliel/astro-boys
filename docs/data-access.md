# Data access: FIRMS MODIS + VIIRS history

How Team Harmonization gets 20+ years of hotspots fast. Researched and tested 2026-11-14.
Script: [`scripts/firms_download.py`](../scripts/firms_download.py) (Python stdlib, nothing to install).

## What we already have (team Drive)

The team pulled the **global yearly zips** on Sat Nov 14 (09:00–10:05 local) into the shared Drive folder
`NasaSpaceApps` (link in the team chat, not in this public repo). Same files as the official FIRMS ones.

| Sensor | Years | Files | Size (zipped) |
|--------|-------|-------|---------------|
| MODIS (Terra + Aqua) | 2000–2025 | `modis_{YYYY}_all_countries.zip` × 26 | ~2.0 GB |
| VIIRS NOAA-20 (`viirs-jpss1`) | 2018–2025 | `viirs-jpss1_{YYYY}_all_countries.zip` × 8 | ~2.8 GB |

Global coverage means the app can serve **any area a user draws**, not just one region.
**MODIS and NOAA-20 overlap for 8 years (2018–2025)**: enough to calibrate the harmonization.

### Gaps

| Gap | Why it matters | How to fill | Priority |
|-----|----------------|-------------|----------|
| **2026 (Jan → today)** | The brief compares the **current month with the historical median**; yearly files stop at 2025 | Area API, NRT sources (`VIIRS_NOAA20_NRT`, `MODIS_NRT`), needs MAP_KEY | **High** |
| VIIRS S-NPP 2012–2025 | Longest VIIRS record; adds 2012–2017 overlap with MODIS. New observations ended 2026-11-02 | `country --country all --sensors viirs-snpp` (~5.0 GB) | Optional |
| VIIRS NOAA-21 | Third VIIRS satellite, 2023/24 onwards | Area API, `VIIRS_NOAA21_SP` / `_NRT` | Low |

## TL;DR: the fast path

1. **Yearly per-country CSVs.** Plain HTTPS, **no key, no login**, archive (science) quality.
   All of Brazil 2000–2025, all three sensors, is about **3.2 GB** (tested with `--dry-run`).
   ```bash
   python3 scripts/firms_download.py country --country Brazil --years 2000-2025 --dry-run   # list + sizes
   python3 scripts/firms_download.py country --country Brazil --years 2000-2025             # download
   ```
   Then clip to our area with a polygon (state / biome) locally.
2. **The area API fills the gaps** the country files don't cover: **NOAA-21** (not in the country files) and
   **2026** (country files stop at 2025). Needs a free MAP_KEY in `.env`; pulls 5-day chunks; resumable.
   ```bash
   python3 scripts/firms_download.py availability     # date range per source
   python3 scripts/firms_download.py api --source VIIRS_NOAA20_NRT --bbox W,S,E,N --start 2026-01-01 --end 2026-11-14
   ```
3. **Do not use the Archive Download tool** unless both fail: it needs a sign-in and delivers by email later.

Downloads land in `data/raw/firms/` (git-ignored) and every one is logged automatically in `data/raw/SOURCES.md`.

### Smart shortcuts

- **Start with the overlap years.** MODIS + S-NPP + NOAA-20 all exist 2018–2025. Pull those first so harmonization
  work can start while older MODIS years download.
- **Download once, share.** One person pulls; the team shares the files (drive / USB) instead of everyone downloading 3 GB.
- **Give Dashboard a small sample** (one state, one year) within the first hours so they're never blocked.
- **Convert to Parquet** after clipping: much smaller and faster to load than the raw CSVs.

## Sources and URLs

| What | URL pattern | Key? | Coverage |
|------|-------------|------|----------|
| Country yearly CSV | `https://firms.modaps.eosdis.nasa.gov/data/country/{sensor}/{YYYY}/{sensor}_{YYYY}_{Country}.csv` | No | `modis` 2000–2025 · `viirs-snpp` 2012–2025 · `viirs-jpss1` (NOAA-20) 2018–2025 · no NOAA-21 |
| File index | `https://firms.modaps.eosdis.nasa.gov/data/country/yearly_summary_files.txt` | No | Every file with size and update date |
| All-country zips | `https://firms.modaps.eosdis.nasa.gov/data/country/zips/{sensor}_{YYYY}_all_countries.zip` | No | Global |
| Area API | `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{W,S,E,N}/{1-5 days}/{YYYY-MM-DD}` | Yes | Sources `MODIS_SP`, `VIIRS_SNPP_SP`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA21_SP`, plus `_NRT` versions |
| Data availability | `https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/{MAP_KEY}/ALL` | Yes | Min/max date per source |
| MAP_KEY signup | https://firms.modaps.eosdis.nasa.gov/api/map_key/ | | Free, by email |

API limits: 5,000 transactions per 10 minutes per key; 1–5 days per request. Two years for one source ≈ 145 requests.
The API's `country` endpoint is listed as unavailable; use the static country files instead.

Fallbacks (slower, not needed if the above works): UMD fire SFTP monthly files (`MCD14ML` for MODIS,
`VNP14IMGML` / `VJ114IMGML` for VIIRS; access details in the MODIS and VIIRS fire user guides), and the
FIRMS Archive Download tool (https://firms.modaps.eosdis.nasa.gov/download/).
Google Earth Engine's FIRMS collections are gridded (not points) and MODIS-only or very recent VIIRS, so they're not suitable.

## Sensor timeline

These dates are the core of the harmonization problem.

| Sensor / satellite | FIRMS archive from | Status (as of 2026-11-14) |
|--------------------|--------------------|---------------------------|
| MODIS Terra | 2000-11-01 | Orbit drifting (overpass time shifting); end of science collection expected ~early 2027 (*unconfirmed*). Standby gap 2026-03-26/27 flagged bad. |
| MODIS Aqua | 2002-07 | Orbit drifting; end expected ~2027 (*unconfirmed*). |
| VIIRS S-NPP | 2012-01-20 | **New observations ceased 2026-11-02.** History stays available. |
| VIIRS NOAA-20 | 2018-04-01 | Active. |
| VIIRS NOAA-21 | 2023-03-01 or 2024-01-17 (*FIRMS pages disagree; check `availability`*) | Active. |

- **Overlap for calibration:** MODIS and VIIRS together from 2012; all three of MODIS, S-NPP and NOAA-20 from 2018.
- **NRT vs archive:** NRT arrives within hours; archive (`_SP`, `version` 61.x MODIS / 2 VIIRS) replaces it
  after roughly 2–5 months. Recent months exist only as NRT. Keep `version` in the data and don't mix silently.
- Sources: [MODIS → VIIRS transition](https://www.earthdata.nasa.gov/data/alerts-outages/transition-from-modis-viirs) ·
  [S-NPP observations cease](https://www.earthdata.nasa.gov/data/alerts-outages/reminder-new-suomi-npp-observations-cease-november-2-2026)

## Field differences (MODIS vs VIIRS CSV)

| Field | MODIS | VIIRS | Harmonization note |
|-------|-------|-------|--------------------|
| `latitude`, `longitude` | Pixel center | Pixel center | Same meaning; different pixel size |
| `brightness` / `bright_ti4` | Band 21/22 brightness temp (K) | I-4 brightness temp (K) | Different bands; not directly comparable |
| `bright_t31` / `bright_ti5` | Band 31 (K) | I-5 (K) | Different bands |
| `scan`, `track` | Pixel size in km, ~1 km at nadir, grows to the swath edge | ~0.375 km at nadir | Use for footprint / area weighting |
| `confidence` | 0–100 (number) | `l` / `n` / `h` (category) | Needs a mapping, e.g. MODIS <30 → low, 30–79 → nominal, ≥80 → high; log the choice |
| `satellite` | `Terra` / `Aqua` | `N` (S-NPP) / `N20` (NOAA-20) / NOAA-21 code | Keep as provenance |
| `frp` | Fire radiative power (MW) | FRP (MW) | Pixel-size dependent |
| `daynight` | `D` / `N` | `D` / `N` | Overpass times differ between satellites |
| `type` | 0 veg fire · 1 volcano · 2 other static land · 3 offshore | same | Filter to `0` for vegetation fire; log it |
| `version` | e.g. `61.03` (archive) | e.g. `2` (archive) | Distinguishes archive from NRT |
| `acq_date`, `acq_time` | UTC date, HHMM | UTC date, HHMM | Same |

Field definitions: https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs
