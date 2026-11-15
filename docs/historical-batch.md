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

Both commands reject an existing version in the selected local data root. Keep simultaneous jobs on different
data roots. After QA and coordination with Kali, publish the counts from a configured host:

```bash
APPLY=1 ./scripts/sync_data.sh push processed cell_month_counts/v1
APPLY=1 ./scripts/sync_data.sh push manifests
```

For a run written to a different local directory, set `ASTRO_SYNC_DATA_ROOT` to that directory
before running either sync command.

Upload `hotspots/v1` separately when it is ready for the Dashboard release.
