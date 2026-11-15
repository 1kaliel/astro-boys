# H13 audit of the VM reproduction: logs, manifests and data

Read-only audit on Sun Nov 15, 2026, 10:18–10:25 UTC, on the team VM (`astro-pipeline-vm`), of the clean-clone
reproduction described in [report.md](report.md) (clone of `main` at `5286248` in `~/repro-h13`, run 03:14–03:21
UTC) and of the early-years test (03:38–03:39 UTC, data root `~/repro-h13/data-test`). Done by an AI assistant
(Claude) for Justino. Nothing was changed, deleted or uploaded. The full audit output is kept with Justino.

## Logs

| Run | Steps | Result |
|-----|-------|--------|
| Reproduction (`repro-logs/steps.txt`) | uv sync, raw pull, ingest, aggregate, ingest-api, coverage, calibrate, validate, validate --final, harmonize | all exit 0 |
| Reproduction CI | `make ci` | exit 127: `make` not installed on the VM (now added to the bootstrap) |
| Reproduction CI, by hand | ruff, pytest, repo hygiene, smoke | exit 0 (lint clean, 83 tests, hygiene ok, smoke 30/30) |
| Early years (`early-test-logs/steps.txt`) | raw links, early ingest, early aggregate, partition copy, coverage, calibrate, harmonize | all exit 0 |

All 21 logs were scanned for errors, warnings, exceptions and tracebacks. The only matches are words inside JSON
output ("error table" in the interval description, "fails" in the pass rule): no real error.

## Secrets

No log, manifest or artifact contains `FIRMS_MAP_KEY` or an unredacted FIRMS API URL (0 files). `.env` was not read.

## Manifests

All 14 manifests have `status = ok`, and every input path they list exists (0 missing).

| Run | Manifest | Output rows | Published run with the same count |
|-----|----------|------------:|-----------------------------------|
| ingest 2003–2025 | `20261115T031515Z_ingest_c3bc72` | 14,477,959 | `20261114T235633Z_ingest_d60f88` |
| aggregate | `20261115T031834Z_aggregate_000e77` | 1,245,608 | `20261115T001222Z_aggregate_aebb70` |
| ingest-api 2026 | `20261115T031841Z_ingest-api_cb8bd1` | 531,036 hotspots; 460,569 passing | `20261115T023446Z_ingest-api_189900` |
| coverage | `20261115T031853Z_coverage_30cd7d` | 34,876 / 1,148 / 36,079 | `20261115T023907Z_coverage_2c0a24` |
| calibrate | `20261115T031853Z_calibrate_9b22b3` | 74,592 factors; 84 uncertainty rows | `20261115T024025Z_calibrate_9e87c8` |
| validate 2020–2021 | `20261115T031913Z_validate_8a1018` | tables identical to `artifacts/metrics/validation_dev_2020-2021.md` | |
| validate --final 2022–2023 | `20261115T031933Z_validate-final_6958fc` | tables identical to `artifacts/metrics/validation_final_2022-2023.md` | `20261115T014038Z_validate-final_1f4753` |
| harmonize, 2003 on | `20261115T031955Z_harmonize_01b131` | 1,782,394 | `20261115T024040Z_harmonize_74cf4f` |
| early ingest 2000–2002 | `20261115T033852Z_ingest_454641` | 215,459 | `20261115T025200Z_ingest_43c9c4` |
| early aggregate | `20261115T033900Z_aggregate_4f259c` | 36,558 | `20261115T025210Z_aggregate_46e67e` |
| coverage with early years | `20261115T033900Z_coverage_2113fa` | 38,044 / 1,256 / 36,079 | `20261115T025349Z_coverage_71a8ae` |
| calibrate with early years | `20261115T033901Z_calibrate_95c59d` | 74,592 | `20261115T025706Z_calibrate_cfd859` |
| harmonize with early years | `20261115T033921Z_harmonize_f18a5e` | 1,838,338 | `20261115T030046Z_harmonize_bce5d2` |

Every manifest reads `code_version 0.1.0 (5286248-dirty)`. The only changes in the clone are untracked folders
created for the run (`repro-logs/`, `data-test/`, `repro-report.md`); no tracked file was modified.

## Raw inputs

- 176 files: 48 yearly zips (MODIS 26, S-NPP 14, NOAA-20 8), `SHA256SUMS.txt` and 127 FIRMS API files.
- All 176 are identical to `gs://<bucket>/astro/raw/firms/` in name, size and MD5.
- `sha256sum -c global/SHA256SUMS.txt`: 48 of 48 OK.

## Processed data and consistency between layers

| Check | Reproduction (`data/`) | With early years (`data-test/`) |
|-------|-----------------------:|--------------------------------:|
| `hotspots/v1` rows | 15,008,995 (= 14,477,959 + 531,036) | 15,224,454 (+ 215,459) |
| Hotspots passing the main filter = sum of `n_hotspots` in `cell_month_counts/v1` | 13,413,037 = 13,413,037 | 13,619,856 = 13,619,856 |
| `cell_month_counts/v1` keys, duplicates | 1,294,418, none | 1,330,976, none |
| Years in the counts | 2003–2026 | 2000–2026 |
| `calendar/v1` rows, years, duplicate keys | 1,782,394, 2003–2026, none | 1,838,338, 2002–2026, none |
| Calendar rows without a count | 0 | 18,648 (the same `missing_count_rows` as the published calendar) |

The early-years calendar was also compared row by row with the published `calendar/v1`: every column of every
row is equal (within 10⁻⁶ relative), including `median_hist` and the anomalies (see [report.md](report.md)).

## Conclusion

The VM logs, manifests and data support the reproduction report: every stage ran, every count matches a
published run, the raw inputs are the bucket's files byte for byte, and the layers are consistent with each
other. The reproduction occupies 12 GB on the VM (`~/repro-h13`) and can be deleted.
