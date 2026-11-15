Failed to create stream fd: Operation not permitted
Failed to create stream fd: Operation not permitted
Failed to create stream fd: Operation not permitted
import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parents[1] / "scripts" / "qa_hotspots.py"
SPEC = importlib.util.spec_from_file_location("qa_hotspots", SCRIPT)
assert SPEC and SPEC.loader
QA = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(QA)


def passing_report():
    return {
        "manifest": {
            "status": "ok",
            "inputs_with_null_rows": 0,
            "declared_output_rows": 1,
        },
        "schema": {"missing": [], "unexpected": []},
        "summary": {"total_rows": 1, "distinct_ids": 1},
        "reconciliation": {"calculated": 1, "declared_output": 1},
        "duplicates": {"duplicate_groups": 0},
        "invalid_counts": {"invalid_latitude": 0},
        "grid_checks": {"invalid_l1_format": 0},
        "numeric_checks": {
            "null_frp": 0,
            "null_mir": 0,
            "null_tir": 0,
            "null_delta": 0,
            "delta_mismatch": 0,
            "invalid_scan": 0,
            "invalid_track": 0,
        },
        "numeric_warning_filter_impact": {"warnings_passing_main_filter": 0},
    }


def test_find_failures_accepts_nonblocking_warnings():
    report = passing_report()
    report["numeric_checks"].update({"negative_frp": 13, "nonpositive_mir": 9, "tir_le_150": 19})

    assert QA.find_failures(report) == []


def test_find_failures_rejects_warning_that_passes_main_filter():
    report = passing_report()
    report["numeric_warning_filter_impact"]["warnings_passing_main_filter"] = 1

    assert QA.find_failures(report) == ["a suspicious numeric value passes the main filter"]


def test_load_manifest_rejects_missing_contract(tmp_path):
    manifest = tmp_path / "manifest.json"
    manifest.write_text("{}", encoding="utf-8")

    with pytest.raises(ValueError, match="Invalid ingest manifest"):
        QA.load_manifest(manifest)
