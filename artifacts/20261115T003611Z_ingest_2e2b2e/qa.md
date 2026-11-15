# H2 ingest QA report

Run: `20261115T003611Z_ingest_2e2b2e`  
Dataset: Northeast Brazil `hotspots/v1`, 2003–2025  
Pipeline version: `0.1.0 (0f1e195)`  
DuckDB version: `2.0.0`  
Verdict: **PASS WITH WARNINGS**

## Executive summary

The normalized dataset has the expected 26-column schema, reconciles exactly with the
manifest, and passes the identity, range, timestamp, grid, confidence, type, and main-filter
checks. No duplicate normalized detections were found. The warnings are 41 physically
suspicious numeric values inherited from low-confidence VIIRS observations. All 41 have
`passes_main_filter = false`, so they do not affect the main harmonization input.

## Manifest reconciliation

| Check | Value |
|---|---:|
| Input files | 45 |
| Inputs without a row count | 0 |
| Raw input rows | 39,356,670 |
| Exact duplicate rows dropped | 0 |
| Rows outside the Northeast bounding box | 24,878,709 |
| Rows dropped by the remaining ingest filters | 2 |
| Declared output rows | 14,477,959 |
| Observed output rows | 14,477,959 |

Reconciliation:

```text
39,356,670 - 0 - 24,878,709 - 2 = 14,477,959
```

The manifest reports status `ok`, records a row count and checksum for every input, and
references a clean Git revision.

## Schema, identity, ranges, and grid

| Check | Result |
|---|---:|
| Expected columns | 26 of 26 |
| Unexpected columns | 0 |
| Rows | 14,477,959 |
| Distinct `hotspot_id` values | 14,477,959 |
| Duplicate normalized groups | 0 |
| Source files represented | 45 |
| Latitude range | -18.4 to -1.0 |
| Longitude range | -48.8 to -34.70018 |
| UTC timestamp range | 2003-01-01 03:49 to 2025-12-31 23:13 |
| Local-date range | 2003-01-01 to 2025-12-31 |
| L1 cells | 217 |
| L2 cells | 3,123 |
| L3 cells | 47,479 |

The following checks returned zero invalid rows: coordinates, bounding box, timestamps,
local dates, year/month derivation, local-date shift, instrument, satellite, day/night,
raw and normalized confidence, type, version, filter flag, country, source file,
instrument/satellite mapping, source year, grid ID formats, grid parent links, L1 coordinate
mapping, `delta_t_k`, scan, and track.

## Counts by satellite

| Instrument | Satellite | Years | Rows | Passing main filter |
|---|---|---|---:|---:|
| MODIS | Aqua | 2003–2025 | 2,082,573 | 2,000,334 |
| MODIS | Terra | 2003–2025 | 1,204,930 | 1,149,017 |
| VIIRS | N20 | 2018–2025 | 3,783,729 | 3,294,825 |
| VIIRS | SNPP | 2012–2025 | 7,406,727 | 6,508,292 |
| **Total** | | **2003–2025** | **14,477,959** | **12,952,468** |

## Confidence classes

MODIS and VIIRS confidence values were normalized separately; the table does not imply
that the instruments use equivalent confidence scales.

| Instrument | Class | Rows | Passing main filter |
|---|---|---:|---:|
| MODIS | high | 1,138,200 | 1,136,444 |
| MODIS | nominal | 2,018,446 | 2,012,907 |
| MODIS | low | 130,857 | 0 |
| VIIRS | high | 776,291 | 775,483 |
| VIIRS | nominal | 9,078,784 | 9,027,634 |
| VIIRS | low | 1,335,381 | 0 |

The difference between a high/nominal count and its passing count is explained by
non-zero `type` values. The implemented main-filter expression matched the expected rule
for every row.

## Detection types

| Instrument | Type | Rows | Passing main filter |
|---|---:|---:|---:|
| MODIS | 0 | 3,279,601 | 3,149,351 |
| MODIS | 2 | 7,816 | 0 |
| MODIS | 3 | 86 | 0 |
| VIIRS | 0 | 11,136,701 | 9,803,117 |
| VIIRS | 2 | 48,756 | 0 |
| VIIRS | 3 | 4,999 | 0 |

## Product version by sensor and year

| Year | Aqua | Terra | SNPP | N20 |
|---:|---|---|---|---|
| 2003 | 6.2 (126,728) | 6.2 (44,263) | — | — |
| 2004 | 6.2 (124,725) | 6.2 (52,557) | — | — |
| 2005 | 6.2 (122,057) | 6.2 (59,710) | — | — |
| 2006 | 6.2 (79,541) | 6.2 (31,410) | — | — |
| 2007 | 6.2 (169,273) | 6.2 (92,233) | — | — |
| 2008 | 6.2 (94,135) | 6.2 (42,675) | — | — |
| 2009 | 6.2 (65,899) | 6.2 (30,053) | — | — |
| 2010 | 6.2 (134,122) | 6.2 (72,501) | — | — |
| 2011 | 6.2 (80,748) | 6.2 (40,971) | — | — |
| 2012 | 6.2 (115,926) | 6.2 (79,374) | 2 (828,461) | — |
| 2013 | 6.2 (56,350) | 6.2 (34,949) | 2 (377,530) | — |
| 2014 | 6.2 (76,206) | 6.2 (49,080) | 2 (519,498) | — |
| 2015 | 6.2 (107,585) | 6.2 (79,114) | 2 (805,789) | — |
| 2016 | 6.2 (67,580) | 6.2 (43,547) | 2 (474,007) | — |
| 2017 | 6.2 (76,058) | 6.2 (54,020); 6.03 (1) | 2 (548,920) | — |
| 2018 | 6.03 (49,565) | 6.03 (32,681) | 2 (353,448) | 2 (336,145) |
| 2019 | 6.03 (70,729) | 6.03 (49,637) | 2 (510,872) | 2 (499,173) |
| 2020 | 6.03 (61,682) | 6.03 (46,005) | 2 (462,744) | 2 (446,061) |
| 2021 | 6.03 (76,500) | 6.03 (51,591) | 2 (533,097) | 2 (515,970) |
| 2022 | 6.03 (75,498) | 6.03 (46,121); 61.03 (4) | 2 (494,400) | 2 (504,425) |
| 2023 | 61.03 (81,719) | 61.03 (60,455) | 2 (533,002) | 2 (506,031) |
| 2024 | 61.03 (82,601) | 61.03 (56,448) | 2 (451,786) | 2 (470,526) |
| 2025 | 61.03 (87,346) | 61.03 (55,530) | 2 (513,173) | 2 (505,398) |

The single Terra 6.03 row assigned to local year 2017 and the four Terra 61.03 rows assigned
to local year 2022 occur at product-version boundaries. The source-file year matches the UTC
acquisition year for every row; local solar date can move a detection across the year boundary.

## Numeric warnings

| Warning | Rows | Observed range | Filter impact |
|---|---:|---|---|
| Negative `frp_mw` | 13 | -2.76 to 9,612.1 MW overall | All 13 excluded |
| Non-positive `brightness_mir_k` | 9 | 0.0 to 508.8 K overall | All 9 excluded |
| `brightness_tir_k <= 150` | 19 | 150.0 to 400.1 K overall | All 19 excluded |

These values are physically suspicious: fire radiative power should not be negative, a zero
brightness temperature is not a plausible observation, and 150 K lies exactly at the checked
lower boundary. They are retained for source fidelity rather than silently changed or deleted.
All 41 warnings are VIIRS observations with `confidence_class = 'l'` and
`passes_main_filter = false`; therefore, they do not affect the main filtered analysis.

This report does not establish whether the values are retrieval noise, source sentinels, or
upstream clipping. That would require checking the corresponding FIRMS source records and
product documentation. Their exclusion follows the independently defined confidence filter,
not a rule introduced after observing these values.

## Reproduction record

The supplied ZIP was tested before extraction and reported no compressed-data errors. The
manifest and all processed Parquet partitions were then read with DuckDB 2.0.0 through the
versioned `scripts/qa_hotspots.py` verifier. From the repository root, set the extracted H2
package path and run:

```bash
H2_PACKAGE_ROOT=/path/to/h2-repro
uv run python scripts/qa_hotspots.py \
  --manifest "$H2_PACKAGE_ROOT/manifests/20261115T003611Z_ingest_2e2b2e.json" \
  --dataset "$H2_PACKAGE_ROOT/processed/hotspots/v1/**/*.parquet" \
  --output /tmp/h3-qa.json
```

The command exits with status 0 only when the blocking checks pass. For this package it
reported `PASS WITH WARNINGS`, no failures, 14,477,959 rows, and the same counts shown in this
report. The QA query set covers:

- manifest arithmetic and input row-count completeness;
- exact schema comparison;
- row count, distinct IDs, normalized duplicate groups, and ranges;
- timestamp, local-date, sensor, satellite, confidence, type, and filter invariants;
- hierarchical grid formats, parent relationships, and coordinate-to-L1 mapping;
- per-satellite, confidence, type, version/year, and partition counts;
- numeric ranges and whether warning rows pass the main filter.

The rerun completed against all 14,477,959 rows. The Parquet dataset remains outside Git; a
reviewer needs the H2 handoff package or an equivalent synced `hotspots/v1` dataset to repeat
the data scan.

## Conclusion

H2 is accepted as the input to downstream processing. The dataset passes the H3 structural
and scientific-contract checks, with the 41 excluded low-confidence VIIRS values recorded as
non-blocking warnings. The reproduction procedure is versioned with this report.
