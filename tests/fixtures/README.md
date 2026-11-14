# Test fixtures

Tiny samples for tests and the smoke run. Real data, unmodified: the first 15 rows of each file.

| File | Source | Retrieved (UTC) |
|------|--------|-----------------|
| `modis_2024_Brazil_sample.csv` | NASA FIRMS, `https://firms.modaps.eosdis.nasa.gov/data/country/modis/2024/modis_2024_Brazil.csv` | 2026-11-14 |
| `viirs-jpss1_2024_Brazil_sample.csv` | NASA FIRMS, `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-jpss1/2024/viirs-jpss1_2024_Brazil.csv` | 2026-11-14 |

Data: NASA FIRMS (Fire Information for Resource Management System), MODIS Collection 6.1 and VIIRS 375 m (NOAA-20).
Keep fixtures under 100 KB; CI rejects larger files.
