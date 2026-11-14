# Challenge brief: Harmonization of MODIS and VIIRS Hot Spots

- **Link:** https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/
- **Difficulty:** Advanced / Intermediate · **Subjects:** Earth Science, Software
- **Checked:** 2026-11-14 ~13:50 UTC. Summary in our words; the official page is the source of truth.

## The problem

Satellites have recorded active-fire hotspots for 20+ years, but the record is split across sensors that can't
be compared directly. MODIS (Terra, Aqua) has the long history but is near end of life; VIIRS replaces it with
finer resolution and different sensitivity and overpass times. Fire managers lack one consistent picture of when
and where burning happened.

## What to build

A **web application** with a **harmonized burning-activity calendar** based on active-fire hotspots, combining
MODIS's long history with VIIRS's continuity and detail into one consistent time series.

Suggested in two parts:

1. **Harmonization** of MODIS and VIIRS hotspots, so that by the end "the sensor of origin no longer matters" and
   patterns, trends and anomalies become the focus. → **Team Harmonization**
2. **Web application** that takes the harmonized data as input: the user selects a region and a date range, then
   views and downloads analytics and visualizations. → **Team Dashboard**

## Features the brief asks for or suggests

| Feature | In brief as | Owner |
|---------|-------------|-------|
| Harmonized MODIS + VIIRS hotspot time series | Core objective | Harmonization |
| Burning calendar: hotspot counts by month × year, early 2000s → present | Core objective | Both |
| Select a region (draw AOI on a map, or enter lat/lon) and a date range | Suggested | Dashboard |
| Which months / years had the most activity | Example use | Dashboard |
| Current month vs historical median for the area | Example use | Both |
| Anomalies against multi-year averages; trends | Suggested | Both |
| Accessible color ramps showing similarity / difference across months | Suggested | Dashboard |
| Downloadable CSV of hotspots found in a search | Suggested | Dashboard |
| Downloadable analytics and visualizations | Suggested | Dashboard |
| Number of fires detected and reported | Suggested | Both |

## Audience

Early-warning and emergency responders, scientists, land managers, firefighters.

## Official resources

Only one is listed: **NASA Earthdata FIRMS** (Fire Information for Resource Management System), active fire /
hotspot data. See [suggested-tools.md](suggested-tools.md). More may be added during the hackathon; recheck the Resources tab.

## What this means for plan v1

- The brief matches plan v1 Blocks 1 and 2 closely.
- The brief does **not** ask for weather-based prediction. Plan v1's Block 3 prediction PoC is a stretch goal;
  anomalies vs the historical median/average **are** asked for.
- The brief expects the user to pick any area, not just one pilot region. A pilot region still makes sense for
  processing; the app should still accept a drawn AOI or coordinates.
