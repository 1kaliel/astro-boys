#!/usr/bin/env python3
"""Validate a normalized hotspots/v1 Parquet dataset against its ingest manifest."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import duckdb

EXPECTED_COLUMNS = {
    "acq_ts_utc",
    "brightness_mir_k",
    "brightness_tir_k",
    "cell_l1",
    "cell_l2",
    "cell_l3",
    "confidence_class",
    "confidence_raw",
    "country",
    "date_local",
    "daynight",
    "delta_t_k",
    "frp_mw",
    "hotspot_id",
    "instrument",
    "latitude",
    "longitude",
    "month",
    "passes_main_filter",
    "satellite",
    "scan_km",
    "source_file",
    "track_km",
    "type",
    "version",
    "year",
}


def query_rows(connection: duckdb.DuckDBPyConnection, sql: str) -> list[dict[str, Any]]:
    cursor = connection.execute(sql)
    names = [column[0] for column in cursor.description]
    return [dict(zip(names, row, strict=True)) for row in cursor.fetchall()]


def first_row(connection: duckdb.DuckDBPyConnection, sql: str) -> dict[str, Any]:
    return query_rows(connection, sql)[0]


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["checks"]
        manifest["inputs"]
        manifest["outputs"][0]["rows"]
    except (OSError, json.JSONDecodeError, KeyError, IndexError, TypeError) as error:
        raise ValueError(f"Invalid ingest manifest: {path}") from error
    return manifest


def collect_report(manifest_path: Path, dataset_glob: str) -> dict[str, Any]:
    manifest = load_manifest(manifest_path)
    connection = duckdb.connect()
    connection.execute("SET threads=4")
    connection.read_parquet(dataset_glob, hive_partitioning=True).create_view("hotspots")

    schema = query_rows(connection, "DESCRIBE SELECT * FROM hotspots")
    actual_columns = {item["column_name"] for item in schema}
    checks = manifest["checks"]

    report: dict[str, Any] = {
        "manifest": {
            "run_id": manifest.get("run_id"),
            "status": manifest.get("status"),
            "code_version": manifest.get("code_version"),
            "duckdb_version": manifest.get("duckdb_version"),
            "input_files": len(manifest["inputs"]),
            "inputs_with_null_rows": sum(item.get("rows") is None for item in manifest["inputs"]),
            "raw_input_rows": checks["raw_input_rows"],
            "duplicates_dropped": checks["exact_duplicate_rows_dropped"],
            "outside_bbox_dropped": checks["rows_outside_bbox_dropped"],
            "other_rows_dropped": checks["other_rows_dropped"],
            "declared_output_rows": manifest["outputs"][0]["rows"],
        },
        "schema": {
            "column_count": len(actual_columns),
            "missing": sorted(EXPECTED_COLUMNS - actual_columns),
            "unexpected": sorted(actual_columns - EXPECTED_COLUMNS),
        },
    }

    report["summary"] = first_row(
        connection,
        """
        SELECT count(*) AS total_rows,
               count(DISTINCT hotspot_id) AS distinct_ids,
               min(latitude) AS latitude_min,
               max(latitude) AS latitude_max,
               min(longitude) AS longitude_min,
               max(longitude) AS longitude_max,
               min(acq_ts_utc) AS timestamp_min,
               max(acq_ts_utc) AS timestamp_max,
               min(date_local) AS date_local_min,
               max(date_local) AS date_local_max,
               count(DISTINCT source_file) AS source_files,
               count(DISTINCT cell_l1) AS cells_l1,
               count(DISTINCT cell_l2) AS cells_l2,
               count(DISTINCT cell_l3) AS cells_l3
        FROM hotspots
        """,
    )

    report["invalid_counts"] = first_row(
        connection,
        """
        SELECT
          count(*) FILTER (WHERE hotspot_id IS NULL OR hotspot_id = '') AS invalid_hotspot_id,
          count(*) FILTER (WHERE latitude IS NULL OR latitude < -90 OR latitude > 90) AS invalid_latitude,
          count(*) FILTER (
            WHERE longitude IS NULL OR longitude < -180 OR longitude > 180
          ) AS invalid_longitude,
          count(*) FILTER (
            WHERE latitude < -18.4 OR latitude > -1.0
               OR longitude < -48.8 OR longitude > -34.7
          ) AS outside_bbox,
          count(*) FILTER (WHERE acq_ts_utc IS NULL) AS null_timestamp,
          count(*) FILTER (WHERE date_local IS NULL) AS null_local_date,
          count(*) FILTER (WHERE month IS NULL OR month NOT BETWEEN 1 AND 12) AS invalid_month,
          count(*) FILTER (WHERE month != month(date_local)) AS month_mismatch,
          count(*) FILTER (WHERE year != year(date_local)) AS year_mismatch,
          count(*) FILTER (
            WHERE abs(date_diff('day', CAST(acq_ts_utc AS DATE), date_local)) > 1
          ) AS local_date_shift_over_one_day,
          count(*) FILTER (WHERE instrument NOT IN ('MODIS', 'VIIRS') OR instrument IS NULL)
            AS invalid_instrument,
          count(*) FILTER (WHERE satellite NOT IN ('Terra', 'Aqua', 'SNPP', 'N20') OR satellite IS NULL)
            AS invalid_satellite,
          count(*) FILTER (WHERE daynight NOT IN ('D', 'N') OR daynight IS NULL) AS invalid_daynight,
          count(*) FILTER (WHERE confidence_raw IS NULL OR confidence_raw = '') AS null_confidence_raw,
          count(*) FILTER (
            WHERE confidence_class NOT IN ('l', 'n', 'h') OR confidence_class IS NULL
          ) AS invalid_confidence_class,
          count(*) FILTER (WHERE type IS NULL OR type NOT BETWEEN 0 AND 3) AS invalid_type,
          count(*) FILTER (WHERE version IS NULL OR version = '') AS null_version,
          count(*) FILTER (WHERE passes_main_filter IS NULL) AS null_filter_flag,
          count(*) FILTER (WHERE cell_l1 IS NULL OR cell_l1 = '') AS null_cell_l1,
          count(*) FILTER (WHERE cell_l2 IS NULL OR cell_l2 = '') AS null_cell_l2,
          count(*) FILTER (WHERE cell_l3 IS NULL OR cell_l3 = '') AS null_cell_l3,
          count(*) FILTER (WHERE country != 'Brazil' OR country IS NULL) AS invalid_country,
          count(*) FILTER (WHERE source_file IS NULL OR source_file = '') AS invalid_source_file,
          count(*) FILTER (
            WHERE (instrument = 'MODIS' AND satellite NOT IN ('Terra', 'Aqua'))
               OR (instrument = 'VIIRS' AND satellite NOT IN ('SNPP', 'N20'))
          ) AS instrument_satellite_mismatch,
          count(*) FILTER (
            WHERE (instrument = 'MODIS' AND try_cast(confidence_raw AS INTEGER) NOT BETWEEN 0 AND 100)
               OR (instrument = 'VIIRS' AND confidence_raw NOT IN ('l', 'n', 'h'))
          ) AS invalid_raw_confidence,
          count(*) FILTER (
            WHERE confidence_class != CASE
              WHEN instrument = 'MODIS' AND try_cast(confidence_raw AS INTEGER) BETWEEN 0 AND 29 THEN 'l'
              WHEN instrument = 'MODIS' AND try_cast(confidence_raw AS INTEGER) BETWEEN 30 AND 79 THEN 'n'
              WHEN instrument = 'MODIS' AND try_cast(confidence_raw AS INTEGER) BETWEEN 80 AND 100 THEN 'h'
              WHEN instrument = 'VIIRS' THEN confidence_raw
            END
          ) AS confidence_class_mismatch,
          count(*) FILTER (
            WHERE passes_main_filter != (type = 0 AND (
              (instrument = 'MODIS' AND try_cast(confidence_raw AS INTEGER) >= 30)
              OR (instrument = 'VIIRS' AND confidence_raw IN ('n', 'h'))
            ))
          ) AS main_filter_mismatch,
          count(*) FILTER (
            WHERE try_cast(regexp_extract(source_file, '_(\\d{4})_', 1) AS INTEGER)
                  != year(acq_ts_utc)
          ) AS source_year_mismatch
        FROM hotspots
        """,
    )

    report["grid_checks"] = first_row(
        connection,
        """
        SELECT count(*) FILTER (WHERE NOT regexp_full_match(cell_l1, 'G[0-9]{6}'))
                 AS invalid_l1_format,
               count(*) FILTER (WHERE NOT regexp_full_match(cell_l2, 'G[0-9]{6}\\.[0-9]{2}'))
                 AS invalid_l2_format,
               count(*) FILTER (
                 WHERE NOT regexp_full_match(cell_l3, 'G[0-9]{6}\\.[0-9]{2}\\.[0-9]{2}')
               ) AS invalid_l3_format,
               count(*) FILTER (WHERE cell_l2 NOT LIKE cell_l1 || '.%') AS invalid_l2_parent,
               count(*) FILTER (WHERE cell_l3 NOT LIKE cell_l2 || '.%') AS invalid_l3_parent,
               count(*) FILTER (
                 WHERE cell_l1 != 'G'
                   || lpad(CAST(floor(latitude + 90) AS INTEGER)::VARCHAR, 3, '0')
                   || lpad(CAST(floor(longitude + 180) AS INTEGER)::VARCHAR, 3, '0')
               ) AS l1_coordinate_mismatch
        FROM hotspots
        """,
    )

    report["duplicates"] = first_row(
        connection,
        """
        SELECT coalesce(sum(n - 1), 0) AS extra_rows, count(*) AS duplicate_groups
        FROM (
          SELECT count(*) AS n
          FROM hotspots
          GROUP BY latitude, longitude, acq_ts_utc, satellite, instrument, daynight,
                   confidence_raw, frp_mw, brightness_mir_k, brightness_tir_k,
                   scan_km, track_km, type, version
          HAVING count(*) > 1
        )
        """,
    )

    report["numeric_checks"] = first_row(
        connection,
        """
        SELECT count(*) FILTER (WHERE frp_mw IS NULL) AS null_frp,
               count(*) FILTER (WHERE frp_mw < 0) AS negative_frp,
               count(*) FILTER (WHERE brightness_mir_k IS NULL) AS null_mir,
               count(*) FILTER (WHERE brightness_mir_k <= 0) AS nonpositive_mir,
               count(*) FILTER (WHERE brightness_tir_k IS NULL) AS null_tir,
               count(*) FILTER (WHERE brightness_tir_k <= 150) AS tir_le_150,
               count(*) FILTER (WHERE delta_t_k IS NULL) AS null_delta,
               count(*) FILTER (
                 WHERE abs(delta_t_k - (brightness_mir_k - brightness_tir_k)) > 0.000001
               ) AS delta_mismatch,
               count(*) FILTER (WHERE scan_km IS NULL OR scan_km <= 0) AS invalid_scan,
               count(*) FILTER (WHERE track_km IS NULL OR track_km <= 0) AS invalid_track,
               min(frp_mw) AS frp_min,
               max(frp_mw) AS frp_max,
               min(brightness_mir_k) AS mir_min,
               max(brightness_mir_k) AS mir_max,
               min(brightness_tir_k) AS tir_min,
               max(brightness_tir_k) AS tir_max
        FROM hotspots
        """,
    )

    report["numeric_warning_filter_impact"] = first_row(
        connection,
        """
        SELECT count(*) FILTER (WHERE frp_mw < 0) AS negative_frp,
               count(*) FILTER (WHERE brightness_mir_k <= 0) AS nonpositive_mir,
               count(*) FILTER (WHERE brightness_tir_k <= 150) AS tir_le_150,
               count(*) FILTER (
                 WHERE passes_main_filter
                   AND (frp_mw < 0 OR brightness_mir_k <= 0 OR brightness_tir_k <= 150)
               ) AS warnings_passing_main_filter
        FROM hotspots
        """,
    )

    report["counts_by_satellite"] = query_rows(
        connection,
        """
        SELECT instrument, satellite, count(*) AS rows,
               count(*) FILTER (WHERE passes_main_filter) AS passing_rows,
               min(year) AS first_year, max(year) AS last_year
        FROM hotspots
        GROUP BY ALL
        ORDER BY instrument, satellite
        """,
    )
    report["confidence_classes"] = query_rows(
        connection,
        """
        SELECT instrument, confidence_class, count(*) AS rows,
               count(*) FILTER (WHERE passes_main_filter) AS passing_rows
        FROM hotspots
        GROUP BY ALL
        ORDER BY instrument, confidence_class
        """,
    )
    report["types"] = query_rows(
        connection,
        """
        SELECT instrument, type, count(*) AS rows,
               count(*) FILTER (WHERE passes_main_filter) AS passing_rows
        FROM hotspots
        GROUP BY ALL
        ORDER BY instrument, type
        """,
    )
    report["versions_by_sensor_year"] = query_rows(
        connection,
        """
        SELECT instrument, satellite, year, version, count(*) AS rows
        FROM hotspots
        GROUP BY ALL
        ORDER BY instrument, satellite, year, version
        """,
    )

    report["reconciliation"] = {
        "calculated": (
            checks["raw_input_rows"]
            - checks["exact_duplicate_rows_dropped"]
            - checks["rows_outside_bbox_dropped"]
            - checks["other_rows_dropped"]
        ),
        "declared_output": manifest["outputs"][0]["rows"],
    }
    report["failures"] = find_failures(report)
    report["verdict"] = "PASS WITH WARNINGS" if not report["failures"] else "FAIL"
    connection.close()
    return report


def find_failures(report: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    manifest = report["manifest"]
    summary = report["summary"]

    if manifest["status"] != "ok":
        failures.append("manifest status is not ok")
    if manifest["inputs_with_null_rows"]:
        failures.append("one or more manifest inputs have no row count")
    if report["schema"]["missing"] or report["schema"]["unexpected"]:
        failures.append("dataset schema differs from the v1 contract")
    if report["reconciliation"]["calculated"] != report["reconciliation"]["declared_output"]:
        failures.append("manifest row reconciliation failed")
    if summary["total_rows"] != manifest["declared_output_rows"]:
        failures.append("observed row count differs from the manifest")
    if summary["total_rows"] != summary["distinct_ids"]:
        failures.append("hotspot_id is not unique")
    if report["duplicates"]["duplicate_groups"]:
        failures.append("normalized duplicate groups were found")
    if any(report["invalid_counts"].values()):
        failures.append("one or more data-contract checks failed")
    if any(report["grid_checks"].values()):
        failures.append("one or more grid checks failed")

    numeric = report["numeric_checks"]
    blocking_numeric_keys = (
        "null_frp",
        "null_mir",
        "null_tir",
        "null_delta",
        "delta_mismatch",
        "invalid_scan",
        "invalid_track",
    )
    if any(numeric[key] for key in blocking_numeric_keys):
        failures.append("one or more blocking numeric checks failed")
    if report["numeric_warning_filter_impact"]["warnings_passing_main_filter"]:
        failures.append("a suspicious numeric value passes the main filter")
    return failures


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path, help="Path to the ingest manifest JSON")
    parser.add_argument(
        "--dataset",
        required=True,
        help="Parquet file or glob, for example data/processed/hotspots/v1/**/*.parquet",
    )
    parser.add_argument("--output", type=Path, help="Optional path for the JSON report")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        report = collect_report(args.manifest, args.dataset)
    except (ValueError, duckdb.Error) as error:
        print(json.dumps({"verdict": "ERROR", "error": str(error)}, indent=2))
        return 2

    rendered = json.dumps(report, indent=2, default=str) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 1 if report["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
