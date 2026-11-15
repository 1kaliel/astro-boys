# H13 independent local audit and remaining acceptance

Prepared for Jean Gustavo on 15 November 2026 with AI assistance. Reference: main commit `4be300e64f2bd89749d124fadfcdc66b87711bbb`.

## Observed results

A clean Git clone installed its locked development dependencies. Python 3.12.16, DuckDB 2.0.0, pytest 9.2.0 and ruff 0.17.5 were used; uv was 0.13.8 rather than CI's 0.12.12. Neither dependency file changed.

| Check | Result |
|---|---|
| Pipeline pytest | 84 passed in 26.76 seconds |
| Ruff, src/tests/scripts | Passed |
| Repository hygiene | Passed, 227 tracked files |
| Shell syntax | Passed |
| CSV to Parquet smoke | 30 input rows, 30 rows read back |
| Smoke manifest | `20261115T095847Z_smoke_4e9e59`; status `ok`; code `0.1.0 (4be300e)` |
| Recalculated input SHA-256 | Both match the smoke manifest |
| Source comparison | 227 files match the reference tree, accounting for Git line-ending filters |
| Scientific tables | All 8 development rows and 16 final/late-year table rows agree with methodology text |

The initial Windows test run encountered long temporary paths and locale encoding. The passing run used UTF-8 and a short temporary directory outside the clone, without changing source code. Local `make` was unavailable; its pipeline components were executed directly. The app frontend/backend and gitleaks were not run locally as part of this audit.

| Fixture | Rows | SHA-256 of the Windows working-copy input |
|---|---:|---|
| `modis_2024_Brazil_sample.csv` | 15 | `c5f5ce7ecd8d19bbd8ad51bee17297cd31c6d303e0479dbb8c64313ff410a47d` |
| `viirs-jpss1_2024_Brazil_sample.csv` | 15 | `dc99ffc100c19e1026cd2e43cdf3ab8432894900b42ee4348f1d3a309c56b2fc` |

These checksums describe the CRLF working-copy files. LF archive copies have different byte hashes; this does not imply different scientific values. Smoke tests validate the toolchain, not production harmonization.

## Review of the existing full reproduction

[PR 38](https://github.com/1kaliel/astro-boys/pull/38), head `95037665d54224aba02e17672079d6308e96ee93`, reports a complete VM reproduction from `5286248` and the early-years follow-up. Its five automatic checks were successful when reviewed: hygiene, gitleaks, pipeline, app backend and app frontend. No submitted human review was returned. Its [original report](report.md) retains its authorship and the distinction between the initial and extended calendar.

The default historical run starts in 2003 and produces 1,782,394 calendar rows. Including the early-years partitions produces the reported 1,838,338 rows and changes historical medians and anomalies. The reviewed runbook documents the additional step. The original partition copy has no dedicated manifest, a traceability limitation.

The local environment did not contain the production raw inputs, Parquet outputs, full VM logs or production manifests. It therefore did not independently recalculate the full H3 scan, reproduce production calibration, or compare every production calendar row. The VM report is existing evidence to review, not a newly observed full-data result.

## Acceptance still required

Update, Nov 15, 10:25 UTC: the VM logs, manifests and data of the full reproduction were inspected read-only
against the bucket and the published runs; see [vm-audit.md](vm-audit.md). Every check passed. What remains for
H13 is the review and merge of this text and the task-board decision.

At Jean's explicit prior instruction, this delivery does not edit the repository diary. Its scope, validation and blockers are recorded here and in the pull request; existing diary entries remain unchanged.
