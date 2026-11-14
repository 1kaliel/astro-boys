# Suggested tools and data

**This is our default stack.** Anything not listed under "From the official challenge" needs a `DECISION` diary
entry explaining why.

## From the official challenge

Checked 2026-11-14 ~13:50 UTC on the challenge's Resources tab. More may be added during the hackathon.

| Resource | Provider | What it gives us | Link | Use? |
|----------|----------|------------------|------|------|
| FIRMS (Fire Information for Resource Management System) | NASA Earthdata | Active fire / hotspot detections from MODIS and VIIRS, near real time and archive | https://firms.modaps.eosdis.nasa.gov/ | **Yes, primary** |

How we get the data: [../data-access.md](../data-access.md).

## Other options from plan v1 (not suggested by the challenge)

Not part of the default stack. Using any of them needs a `DECISION` entry.

| Resource | Provider | Possible use | Status |
|----------|----------|--------------|--------|
| Planetary Computer (STAC) | Microsoft (Global Offer) | Land cover / biome layers for context | Not planned |
| Meteomatics Weather API | Meteomatics (Global Offer) | Weather features for a prediction stretch goal | Not planned; the brief doesn't ask for prediction |
| Google Cloud credits | Global Offer | Hosting and processing | **Adopted** as the primary environment (ADR 0004); check eligibility before relying on credits |
| Azure credits | Global Offer | Hosting or processing | Not used |

## Deviations (approved)

| Instead of / in addition to | We use | Why | Diary entry |
|-----------------------------|--------|-----|-------------|
| In addition to FIRMS (challenge lists no compute or hosting) | Google Cloud: Cloud Storage, Compute Engine, Cloud Run | Shared data, a 16 GB machine for global files, public dashboard URL. Local fallback kept | 2026-11-14 DECISION, [ADR 0004](../decisions/0004-gcp-primary-local-fallback.md) |
| | Python, DuckDB, uv, Parquet | Open-source pipeline tools; DuckDB handles data larger than RAM | Same |
