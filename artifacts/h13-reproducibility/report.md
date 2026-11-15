# H13 reproducibility run from a clean clone

Run on Sun Nov 15, 2026, 03:14–03:21 UTC, on the team VM (`astro-pipeline-vm`, e2-standard-4), by an AI assistant
(Claude) for Justino. Clean clone of `main` at commit `5286248` in `~/repro-h13`, its own data root (`data/`),
`.env` copied from `.env.example` (no MAP_KEY needed), raw data pulled read-only from the bucket. Nothing was pushed
to the bucket or to git. Logs: `~/repro-h13/repro-logs/` on the VM.

## Commands and runtime

| Step | Command | Time | Result |
|------|---------|-----:|--------|
| Environment | `uv sync --frozen --extra gcs` | 1 s | ok |
| Raw data | `APPLY=1 ./scripts/sync_data.sh pull raw firms` (9.2 GiB, 48 zips + 127 API chunks) | 49 s | ok |
| Ingest | `uv run astro-fire --data-root data ingest` | 200 s | ok |
| Aggregate | `... aggregate` | 6 s | ok |
| 2026 API | `... ingest-api` | 12 s | ok |
| Coverage | `... coverage` | 1 s | ok |
| Calibrate | `... calibrate` | 20 s | ok |
| Validate (2020–2021) | `... validate` | 20 s | ok |
| Final test (2022–2023) | `... validate --final` | 22 s | ok |
| Harmonize | `... harmonize` | 7 s | ok |
| CI | `make ci` | – | **failed: `make` is not installed on the VM** (exit 127) |
| CI, by hand | `ruff check`, `pytest`, `check_repo_hygiene.sh`, `astro-fire smoke` | ~60 s | ok: lint clean, 83 tests passed, hygiene ok, smoke 30/30 rows |

Pipeline total: **5 min 38 s** (03:14:24 → 03:20:02 UTC).

## What matched

| Stage | Reproduced | Published | Match |
|-------|-----------:|----------:|-------|
| Ingest, normalized rows 2003–2025 (`hotspots/v1`) | 14,477,959 | 14,477,959 (`20261114T235633Z_ingest_d60f88`, `20261115T003611Z_ingest_2e2b2e`) | exact |
| Aggregate, count keys (`cell_month_counts/v1`) | 1,245,608 | 1,245,608 (`20261115T001222Z_aggregate_aebb70`) | exact |
| 2026 API, hotspot rows / passing the main filter | 531,036 / 460,569 | 531,036 / 460,569 (`20261115T023446Z_ingest-api_189900`) | exact |
| Coverage (daily / monthly / month-to-date rows) | 34,876 / 1,148 / 36,079 | 34,876 / 1,148 / 36,079 (`20261115T023907Z_coverage_2c0a24`) | exact |
| Calibrate: pool, K, M, Terra witness, λ, model | l1, 50, 5, on (M = 5), 0.75, `fb-l1-terra-rec-4` | same (`20261115T024025Z_calibrate_9e87c8`, `…025706Z_calibrate_cfd859`) | exact |
| Calibrate: factor rows, cells, panel rows | 74,592; 3,108; 590,520 | same | exact |
| Calibrate: all 775 numbers in `calibration.json` vs `artifacts/metrics/calibration_2012-2019.json` | | | equal within 1.1 × 10⁻¹³ (floating-point summation order) |
| Validate 2020–2021, every table row vs `artifacts/metrics/validation_dev_2020-2021.md` | | | identical |
| Final test 2022–2023, every table row vs `artifacts/metrics/validation_final_2022-2023.md` | | | identical; `accepted = true`, same 130,536 rows and the same three months left out |
| Calendar, 2003–2026 rows | 1,782,394 | 1,782,394 for the same years (`20261115T024040Z_harmonize_74cf4f`) | exact row set |
| Calendar values: count, interval, variance, raw counts, origin and flags, per row | | | equal within 4 × 10⁻¹² (no difference above 10⁻⁶ relative) |

## What differed, and why

1. **The published calendar has one more year.** The latest published calendar
   (`20261115T030046Z_harmonize_bce5d2`, 1,838,338 rows) includes 2002 (55,944 rows). It comes from a separate
   early-years ingest (`20261115T025200Z_ingest_43c9c4`, Terra and Aqua 2000–2002, written to `interim/early`) and
   aggregate (`…025210Z_aggregate_46e67e`), whose 2000–2002 partitions were then added to the main counts that
   harmonize read. The documented commands
   (`ingest` defaults to 2003–2025) do not include that step, so a clean run stops at 2003.
2. **Because of that, the historical median differs.** The published run computes `median_hist` over 2002–2026,
   the clean run over 2003–2026. About 594,000 rows differ in `median_hist`, `anomaly_abs`, `anomaly_pct` and
   `anomaly_z` (largest difference in the median: 54.5 detections). Everything else in the calendar matches.
3. **Input checksums are not directly comparable.** The published ingest read Brazil CSVs extracted on a laptop
   (`raw/firms/country/`), the clean run read the 48 yearly zips from the bucket (`raw/firms/global/`), so the
   SHA-256 values in the manifests are of different files. Row counts after ingest are identical.
4. **`code_version` reads `5286248-dirty`** in every manifest of the clean run, only because the log folder
   `repro-logs/` was created inside the clone. No tracked file was changed.

## Follow-up

- The early-years step (2000–2002) is now documented, with the full reproduction order and the row counts to
  check: [docs/historical-batch.md](../../docs/historical-batch.md#early-years-20002002-terra-only-then-aqua-from-july-2002).
  Tested at 03:38–03:39 UTC in the same clone, in a separate data root, following the doc: early ingest 215,459
  rows, early aggregate 36,558, coverage 38,044 / 1,256 / 36,079, calibrate unchanged (74,592 factors), calendar
  1,838,338 rows with medians over 2002–2026. Every column of every row equals the published calendar.
- `make` is added to the VM bootstrap (`infra/gcp/vm/bootstrap.sh`).
- Next time, write logs outside the clone so `code_version` stays clean.

