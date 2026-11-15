# Tool usage

How to use what the challenge provides (NASA FIRMS) and what we set up around it.
Decisions about which tools we use: [challenge/suggested-tools.md](challenge/suggested-tools.md).

| I want to… | Go to |
|------------|-------|
| Look at hotspots on a map, sanity-check a result | [FIRMS Fire Map](#1-firms-fire-map-look-before-you-compute) |
| Get years of history | [Yearly files](#2-firms-yearly-files-our-main-source) (already in our bucket) |
| Get 2026 or the current month | [FIRMS API](#3-firms-api-2026-and-the-current-month) |
| Understand a column | [Fields](#5-reading-the-data-fields-versions-pitfalls) |
| Cite NASA correctly | [Citation](#6-citation-and-disclaimer) |
| Run the pipeline | [Our pipeline](#7-our-pipeline-uv-make-astro-fire-duckdb) |
| Use the VM, the bucket, deploy the app | [Google Cloud](#8-google-cloud-vm-bucket-cloud-run) |
| Commit, open a PR, log a decision | [Repo workflow](#9-repo-workflow) |

## The challenge's resource: NASA FIRMS

FIRMS (Fire Information for Resource Management System, NASA Earthdata) is the only resource the challenge lists.
Portal: https://firms.modaps.eosdis.nasa.gov/ · About: https://www.earthdata.nasa.gov/data/tools/firms

### 1. FIRMS Fire Map: look before you compute

https://firms.modaps.eosdis.nasa.gov/map/

- Shows MODIS and VIIRS hotspots on a map, with layers per sensor and a date selector.
- Use it to **sanity-check**: does our count for a cell and month look like what the map shows? Do MODIS and
  VIIRS layers differ the way our factors say?
- Use it to pick a demo region with a clear fire season.
- Screenshots may be used as references with credit to NASA FIRMS. Don't alter NASA logos or branding.

### 2. FIRMS yearly files: our main source

Plain HTTPS, no login, standard-processing (science) quality. Already downloaded and checksummed in
`gs://<bucket>/astro/raw/firms/global/` (48 zips). You normally **don't download again**.

| File | URL pattern |
|------|-------------|
| One country, one year | `https://firms.modaps.eosdis.nasa.gov/data/country/{sensor}/{YYYY}/{sensor}_{YYYY}_{Country}.csv` |
| All countries, one year | `https://firms.modaps.eosdis.nasa.gov/data/country/zips/{sensor}_{YYYY}_all_countries.zip` |
| Index of every file | `https://firms.modaps.eosdis.nasa.gov/data/country/yearly_summary_files.txt` |

`{sensor}`: `modis` (2000–2025), `viirs-snpp` (2012–2025), `viirs-jpss1` = NOAA-20 (2018–2025). No NOAA-21, no 2026.
Inside a zip: `{sensor}/{YYYY}/{sensor}_{YYYY}_{Country}.csv` plus `AttributesReadme.txt`.

```bash
# What exists and how big (downloads nothing)
python3 scripts/firms_download.py country --country Brazil --years 2018-2025 --dry-run
# One country for local work (Brazil 2000–2025, three sensors ≈ 3.2 GB)
python3 scripts/firms_download.py country --country Brazil --years 2024 --sensors modis
# Pull one CSV out of a zip without unpacking everything
unzip -j data/raw/firms/global/modis/modis_2020_all_countries.zip 'modis/2020/modis_2020_Brazil.csv' -d data/interim/unzipped/modis/2020/
```

Every download made with the script is logged in `data/raw/SOURCES.md`. Raw files are never edited.

### 3. FIRMS API: 2026 and the current month

Needed for what the yearly files lack. Requires a free **MAP_KEY**.

1. Request the key: https://firms.modaps.eosdis.nasa.gov/api/map_key/ (arrives by email).
2. Put it in `.env` as `FIRMS_MAP_KEY=...`. Never commit it, never paste it in chat or in a notebook.
3. Check what each source covers, then pull:

```bash
python3 scripts/firms_download.py availability
python3 scripts/firms_download.py api --source VIIRS_NOAA20_NRT --bbox -74,-34,-34,6 \
    --start 2026-01-01 --end 2026-11-15 --dry-run        # shows the number of requests
python3 scripts/firms_download.py api --source VIIRS_NOAA20_NRT --bbox -74,-34,-34,6 \
    --start 2026-01-01 --end 2026-11-15
```

| Fact | Value |
|------|-------|
| Endpoint | `/api/area/csv/{MAP_KEY}/{SOURCE}/{west,south,east,north}/{days 1–5}/{YYYY-MM-DD}` |
| Standard-processing sources | `MODIS_SP`, `VIIRS_SNPP_SP`, `VIIRS_NOAA20_SP`, `VIIRS_NOAA21_SP` |
| Near-real-time sources | `MODIS_NRT`, `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT` |
| Limit | 5,000 transactions per 10 minutes per key; a request for several days can count as several |
| Date range per source | `/api/data_availability/csv/{MAP_KEY}/ALL` |

- Standard processing replaces near-real-time after a few months. For 2026 use `_SP` where it exists and `_NRT`
  for the most recent months; the pipeline flags NRT rows.
- The script is resumable: it skips chunks it already has. `bbox` above covers Brazil.
- S-NPP stopped observing on 2026-11-02. For November 2026 onward use NOAA-20.

### 4. FIRMS Archive Download (fallback only)

https://firms.modaps.eosdis.nasa.gov/download/ — request by area and dates, sign in, results arrive by email
later. Slower than sections 2 and 3; use it only if both fail.

### 5. Reading the data: fields, versions, pitfalls

Full field table: [data-dictionary.md](data-dictionary.md#raw-firms-fields-as-delivered).
Official definitions: https://www.earthdata.nasa.gov/data/tools/firms/active-fire-data-attributes-modis-viirs

| Pitfall | What to do |
|---------|------------|
| `acq_date` / `acq_time` are **UTC** | Build a UTC timestamp; derive the local solar date with `+ longitude/15 hours` |
| `confidence`: number for MODIS, letter for VIIRS | Filter per sensor (`>= 30`; `n`, `h`). Never compare the two scales |
| `brightness` vs `bright_ti4`, `bright_t31` vs `bright_ti5` | Different bands. Compare only within one sensor |
| `version` | Tells collection and processing; `NRT`/`RT`/`URT` suffix = near real time. Keep it on every row |
| `type` | Keep `0` (vegetation fire) for the main analysis |
| `satellite` | MODIS files mix `Terra` and `Aqua`; VIIRS uses `N` (S-NPP), `N20`, `N21`. Always split by satellite |
| One row | A pixel flagged as hot, not a fire. VIIRS shows several rows where MODIS shows one |
| No row | Not proof of no fire (no overpass, cloud, below detection limit) |

### 6. Citation and disclaimer

- In the app, the repo and the project page: "Data: NASA FIRMS (LANCE), MODIS (Collection 6 / 6.1) and VIIRS
  375 m (Collection 2) active fire products", with a link to https://earthdata.nasa.gov/firms.
- When redistributing FIRMS data (our CSV download does), follow the FIRMS citation guideline and link the
  disclaimer; both are referenced in the `AttributesReadme.txt` shipped inside every yearly zip.
- NASA does not endorse our project. Don't use or modify NASA logos.

## What we set up

### 7. Our pipeline: uv, make, astro-fire, DuckDB

Needs only [uv](https://docs.astral.sh/uv/) (it installs the right Python).

```bash
cp .env.example .env
make setup      # locked environment
make smoke      # sample rows → DuckDB → partitioned Parquet → manifest
make ci         # lint, tests, repo hygiene, smoke: run before every push
uv run astro-fire info                          # where data is read from / written to
uv run astro-fire --data-root data smoke        # force local storage
```

Stages that exist:

```bash
uv run astro-fire --data-root data ingest --years 2012-2021 --satellites Aqua SNPP   # FIRMS files → hotspots/v1
uv run astro-fire --data-root data aggregate                                       # → cell_month_counts/v1
uv run astro-fire mock-calendar     # SYNTHETIC calendar table for building the app (data-dictionary.md, section 5)
uv run astro-fire ingest-api        # raw/firms/api/* (current year) → hotspots and counts partitions of that year
uv run astro-fire coverage          # processed/hotspots/v1 → coverage_daily, coverage_monthly, month_to_date + gap report
uv run astro-fire coverage --hotspots gs://<bucket>/astro/processed/hotspots/v1   # read it from the bucket
uv run astro-fire calibrate         # processed/cell_month_counts/v1 → processed/factors/v1 + report + manifest
uv run astro-fire calibrate --counts path/to/cell_month_counts --years 2012-2019 --k 20 --m 2   # overrides
```

`ingest` and `aggregate` are described in the [historical Northeast batch runbook](historical-batch.md).
The years before 2003 (Terra from 2000-11, Aqua from 2002-07) are a separate run added to the main data root:
[early years](historical-batch.md#early-years-20002002-terra-only-then-aqua-from-july-2002). Full order to
rebuild everything from a clean clone, with the row counts to check:
[full reproduction](historical-batch.md#full-reproduction-from-a-clean-clone).

`calibrate` reads the monthly counts (`cell_l2, year, month, daynight, satellite, n_hotspots`; satellites named
`Aqua` and `SNPP`), chooses the pooling weights by leave-one-year-out cross-validation unless `--k`/`--m` are
given, and writes `artifacts/<run_id>/metrics/calibration.json` with the scores and the regional ratios. It
stops with a message if a calibration year is missing for a satellite, if keys are duplicated, or if the years
include the test years (2020–2021). A month with no detections at all for one satellite is treated as a data
gap and left out, never counted as zero.

`validate` refits the factors on the calibration years and scores six methods on the held-out years
(2020–2021) against what S-NPP observed: raw Aqua, one global ratio, a global OLS line, a ratio per month and
day/night, `F`, and `F + B`.

```bash
uv run astro-fire validate          # prints the table; writes artifacts/<run_id>/metrics/validation.json
                                    # and artifacts/<run_id>/reports/validation.md
```

By default it scores the development years (2020–2021). The final test years (2022–2023, plus 2024–2025
reported separately) are locked: `uv run astro-fire validate --final` opens them, **once, after the method
is frozen**. Run `coverage` first so months with a satellite outage are left out of the scores.

The JSON holds every method at two levels (cell-month, and regional monthly totals) split by day/night, year,
season and Aqua = 0 vs Aqua > 0, plus a `verdict`: whether `F + B` beats every baseline at both levels, and
which method ships if it does not.

Run `uv run astro-fire harmonize` with the monthly counts, factors and coverage Parquet under
the configured data root. Use `--counts`, `--factors` and `--coverage` for inputs stored elsewhere.
The calendar is partitioned by year and the manifest identifies the model and the input files.
For a local rerun, stage the release in a fresh data root and compare it before publishing.

The remaining `export` stage is listed in
[spec/harmonization.md](spec/harmonization.md#10-pipeline-commands-to-build).

DuckDB, for quick looks (also works in a notebook with `import duckdb`):

```bash
uv run python - <<'PY'
import duckdb
con = duckdb.connect()
# A FIRMS CSV: keep acq_time as text (it is HHMM, e.g. "0058")
print(con.sql("""
  SELECT satellite, daynight, count(*) AS n
  FROM read_csv('tests/fixtures/modis_2024_Brazil_sample.csv', types={'acq_time': 'VARCHAR'})
  GROUP BY ALL ORDER BY n DESC
"""))
# Partitioned Parquet written by the smoke run
print(con.sql("SELECT sensor, year, month, count(*) FROM read_parquet('data/interim/smoke/*/hotspots/**/*.parquet', hive_partitioning=true) GROUP BY ALL"))
PY
```

- Paths in pipeline code come from `astro_fire.storage.uri(settings, layer, ...)`, never hard-coded.
- Memory: set `DUCKDB_MEMORY_LIMIT` to about half the machine's RAM (2GB on small laptops, 10GB on the VM).
- New dependency: `uv add <package>`, commit `uv.lock`.

### 8. Google Cloud: VM, bucket, Cloud Run

Project, region and bucket names: [cloud/README.md](cloud/README.md#live-status-2026-11-14). Access is per person
([cloud/iam-and-access.md](cloud/iam-and-access.md)); ask Kali if a command is denied. No key files, ever.

```bash
gcloud auth login && gcloud auth application-default login     # once per machine
./infra/gcp/vm-control.sh status
APPLY=1 ./infra/gcp/vm-control.sh start                        # billing starts
./infra/gcp/vm-control.sh ssh
#   on the VM:
cd ~/astro-boys && git pull && uv sync --frozen --extra gcs
tmux new -s pipeline                                           # long jobs survive a dropped connection
APPLY=1 ./scripts/sync_data.sh pull raw firms                  # bucket → VM disk
uv run astro-fire <stage>
APPLY=1 ./scripts/sync_data.sh push processed
APPLY=1 ./scripts/sync_data.sh push manifests
APPLY=1 ./infra/gcp/vm-control.sh stop                         # when done (it also stops itself after 30 idle minutes)
```

- Every script prints what it would do; `APPLY=1` makes it act.
- Don't pull the whole raw layer to a laptop (9 GiB, and egress is billed). Pull one country or use the VM.
- Dashboard deploy: [deploy/cloudrun/README.md](../deploy/cloudrun/README.md). The container must serve on
  `$PORT`, be stateless and read data read-only. Kali approves each deploy.

### 9. Repo workflow

```bash
git checkout -b feat/<thing>                 # no direct pushes to main
make ci                                      # must pass
./scripts/log.sh done "what you finished"    # diary: decision | done | blocker | idea | meeting | note
git commit -m "feat: <what>"                 # Conventional Commits, no AI co-author lines
git push -u origin feat/<thing> && gh pr create --fill
```

CI on every PR: lint, tests, smoke run, secret scan, and a check that blocks `.env`, credentials and data files.
Rules: [AGENTS.md](../AGENTS.md) · [CONTRIBUTING.md](../CONTRIBUTING.md).

### 10. Global Offers

Optional partner tools from the Space Apps Global Offers page. We use **Google Cloud** (credits). The others
(Azure, Meteomatics, Planetary Computer, Miro, Teams, Copilot, domain/hosting) are not part of the plan; using
one needs a `DECISION` entry first.
