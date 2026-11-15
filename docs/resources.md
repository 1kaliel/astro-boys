# Resources and credits

Space Apps asks teams to credit every data source and tool. Add each one **the moment we use it**.
Before submitting, check each product's documentation for its required citation and terms.

## Data sources used

| Source | What we used | URL | License / citation | Added by |
|--------|--------------|-----|--------------------|----------|
| | | | | |

Planned: NASA FIRMS MODIS + VIIRS active fire (the challenge's listed resource). See [data-access.md](data-access.md).
At least one NASA data source is required for global judging.

## Tools and libraries used

| Tool | Purpose | License |
|------|---------|---------|
| [DuckDB](https://duckdb.org/) | Pipeline query engine (CSV → Parquet, out-of-core) | MIT |
| [uv](https://docs.astral.sh/uv/) | Python env and locked dependencies | Apache-2.0 / MIT |
| [Python](https://www.python.org/) 3.12 | Pipeline language | PSF |
| [gcsfs](https://github.com/fsspec/gcsfs) | Optional `gs://` access | BSD-3-Clause |
| [pytest](https://pytest.org/), [Ruff](https://docs.astral.sh/ruff/) | Tests, lint | MIT |
| [gitleaks](https://github.com/gitleaks/gitleaks) | CI secret scan | MIT |
| Google Cloud (Cloud Storage, Compute Engine, Cloud Run, Artifact Registry) | Shared data, pipeline VM, dashboard hosting | Commercial service |
| GitHub, GitHub Actions | Code hosting, CI | Commercial service |

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
| Historical FIRMS ingestion and monthly aggregation implementation, regression fixture, and runbook | Codex | Assisted with pipeline code and verification. Historical detections come from NASA FIRMS. See [historical batch](historical-batch.md). |
