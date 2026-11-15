# Historical Northeast ingestion and monthly counts

The first calibration and validation delivery uses Aqua and S-NPP for local solar years 2012–2021.
Use `ASTRO_DATASET_VERSION=v1` in the local `.env` and run from the repository root.

```bash
uv sync --locked
uv run astro-fire --data-root data ingest --years 2012-2021 --satellites Aqua SNPP
uv run astro-fire --data-root data aggregate
```

The commands use the same local data layout on a workstation and on the VM.
Ingest reads Brazil CSVs from `raw/firms/country/<sensor>/` when present.
Otherwise it extracts only the Brazil CSV member from each yearly ZIP in `raw/firms/global/<sensor>/`.
Supply the 2022 archives as well, since early UTC hours on January 1 can fall in December 2021 in Brazil.
For the full MVP history, use the default year range and satellite selection in a fresh local data root.
The input archive ends in UTC year 2025. The final local day of 2025 can therefore have incomplete coverage.

Outputs under `data/`:

- `processed/hotspots/v1/` contains ZSTD Parquet by instrument and local solar year, with provenance,
  stable source row IDs, confidence filter flags and L1/L2/L3 cells.
- `processed/cell_month_counts/v1/` contains ZSTD Parquet by local solar year, one row per
  `cell_l2, year, month, daynight, satellite` with at least one detection that passes the main filter.
  `n_all_confidence` counts vegetation detections in that key across confidence classes.
- `manifests/` records input checksums, row counts and output paths for both stages.
  Ingest records raw input rows and exact duplicate rows removed before clipping, per file and in total.
  It then counts deduplicated rows outside the bounding box (including invalid coordinates).
  `other_rows_dropped` reconciles the remaining difference from the timestamp, local year, instrument,
  satellite and day/night filters.

Both commands reject an existing version in the selected local data root. Keep simultaneous jobs on different
data roots. After QA and coordination with Kali, publish the counts from a configured host:

```bash
APPLY=1 ./scripts/sync_data.sh push processed cell_month_counts/v1
APPLY=1 ./scripts/sync_data.sh push manifests
```

For a run written to a different local directory, set `ASTRO_SYNC_DATA_ROOT` to that directory
before running either sync command.

Upload `hotspots/v1` separately when it is ready for the Dashboard release.

## Early years 2000–2002 (Terra only, then Aqua from July 2002)

The main `ingest` covers local solar years 2003–2025 by default. The published calendar also starts earlier
(2002-07, Aqua's first months), and its historical medians run over 2002–2026. The years before 2003 come
from a **separate run**, written to its own data root and then added to the main one. Recovered from the
published manifests (`gs://<bucket>/astro/manifests/`):

| Run | What it did | Rows |
|-----|-------------|-----:|
| `20261115T025200Z_ingest_43c9c4` | `ingest`, local years 2000–2002, satellites Terra and Aqua, data root `data/interim/early`; inputs `modis_2000…2003_all_countries.zip` (2003 for the UTC hours that fall in local 2002) | 215,459 |
| `20261115T025210Z_aggregate_46e67e` | `aggregate` in the same data root | 36,558 |
| (no manifest) | the `year=2000`, `2001` and `2002` partitions were added to the main `processed/hotspots/v1/instrument=MODIS/` and `processed/cell_month_counts/v1/` (in the bucket since 02:53 UTC) | |
| `20261115T025349Z_coverage_71a8ae`, `…025706Z_calibrate_cfd859`, `…030046Z_harmonize_bce5d2` | `coverage`, `calibrate` and `harmonize` on the main data root, now including 2000–2002 | see below |

The command that copied the partitions is not recorded in any manifest. The commands below do the same thing:
tested on Nov 15, 2026 in a clean clone, they rebuild the published calendar exactly (1,838,338 rows, every
column equal, medians over 2002–2026).

```bash
mkdir -p data/interim/early/raw/firms/global/modis
for y in 2000 2001 2002 2003; do ln -s "$PWD"/data/raw/firms/global/modis/modis_${y}_all_countries.zip data/interim/early/raw/firms/global/modis/; done
uv run astro-fire --data-root data/interim/early ingest --years 2000-2002 --satellites Terra Aqua
uv run astro-fire --data-root data/interim/early aggregate
for y in 2000 2001 2002; do
  cp -r data/interim/early/processed/hotspots/v1/instrument=MODIS/year=$y data/processed/hotspots/v1/instrument=MODIS/
  cp -r data/interim/early/processed/cell_month_counts/v1/year=$y data/processed/cell_month_counts/v1/
done
```

The early run reads its raw files from `data/interim/early/raw/firms/global/modis/` (the published run did
too), hence the links. The Terra-only months (2000-11 → 2002-06) enter the counts and the coverage
table but are not published in the calendar ([why](methodology.md#extending-the-record-before-2003)).

## Full reproduction from a clean clone

Order, with the published row counts to check against. A clean clone on the VM ran every stage on Nov 15, 2026, and matched
these counts exactly
([report](../artifacts/h13-reproducibility/report.md)).

```bash
git clone https://github.com/1kaliel/astro-boys.git repro && cd repro
cp .env.example .env                      # no FIRMS_MAP_KEY needed; set DUCKDB_MEMORY_LIMIT=10GB on the VM
uv sync --frozen --extra gcs
APPLY=1 ./scripts/sync_data.sh pull raw firms      # 9.2 GiB: 48 yearly zips + 127 API files (2026)
uv run astro-fire --data-root data ingest          # 2003–2025
uv run astro-fire --data-root data aggregate
#   early years 2000–2002: the section above (after aggregate, which refuses an existing counts dataset)
uv run astro-fire --data-root data ingest-api      # 2026
uv run astro-fire --data-root data coverage
uv run astro-fire --data-root data calibrate
uv run astro-fire --data-root data validate
uv run astro-fire --data-root data validate --final   # only to reproduce the frozen final test
uv run astro-fire --data-root data harmonize
make ci
```

| Stage | Without early years | With early years (published) |
|-------|--------------------:|-----------------------------:|
| `ingest`, normalized rows 2003–2025 | 14,477,959 | 14,477,959 (+ 215,459 in `interim/early`) |
| `aggregate`, count keys 2003–2025 | 1,245,608 | 1,245,608 (+ 36,558) |
| `ingest-api`, 2026 rows / passing the main filter | 531,036 / 460,569 | same |
| `coverage`, daily / monthly / month-to-date rows | 34,876 / 1,148 / 36,079 | 38,044 / 1,256 / 36,079 |
| `calibrate`, factor rows (l1, K = 50, M = 5, λ = 0.75) | 74,592 | 74,592 |
| `validate` and `validate --final` tables | as `artifacts/metrics/validation_*` | same |
| `harmonize`, calendar rows | 1,782,394 (2003–2026, medians over 2003–2026) | 1,838,338 (from 2002, medians over 2002–2026) |

- Input checksums in the manifests differ between runs that read Brazil CSVs extracted on a laptop
  (`raw/firms/country/`) and runs that read the yearly zips from the bucket (`raw/firms/global/`): they are
  checksums of different files. The row counts after ingest are the same.
- Keep run logs outside the clone. A log folder inside it makes `code_version` read `-dirty` in every manifest.
- `make` is installed by the VM bootstrap from now on; on an older VM run the CI steps directly:
  `uv run ruff check src tests scripts && uv run pytest && ./scripts/check_repo_hygiene.sh && uv run astro-fire smoke`.
