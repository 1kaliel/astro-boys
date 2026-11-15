"""D8: the calendar baked into the image is checked at build time and reported by /api/version."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from test_calendar_api import _write_calendar

from astro_dashboard import bake
from astro_dashboard.main import app


def test_print_model_version_reads_the_calendar(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _write_calendar(tmp_path)

    assert bake.main(["--print-model-version", str(tmp_path / "processed" / "calendar" / "v1")]) == 0
    assert capsys.readouterr().out.strip() == "test-model"


def test_check_records_what_was_baked(tmp_path: Path) -> None:
    _write_calendar(tmp_path)

    info = bake.check(tmp_path, "v1", expect="test-model", allow_empty=False)

    assert info["model_version"] == "test-model"
    assert info["first_year"] == 2003 and info["last_year"] == 2007
    assert info["files"] == 5
    assert json.loads((tmp_path / "build-info.json").read_text())["model_version"] == "test-model"


def test_check_fails_when_the_model_version_is_not_the_expected_one(tmp_path: Path) -> None:
    _write_calendar(tmp_path)

    with pytest.raises(SystemExit, match="expected other-model"):
        bake.check(tmp_path, "v1", expect="other-model", allow_empty=False)


def test_check_fails_without_a_calendar_unless_allowed(tmp_path: Path) -> None:
    with pytest.raises(SystemExit, match="No calendar in the image"):
        bake.check(tmp_path, "v1", expect=None, allow_empty=False)

    info = bake.check(tmp_path, "v1", expect=None, allow_empty=True)
    assert info["model_version"] is None and info["rows"] == 0


def test_api_version_reports_the_loaded_and_the_baked_model(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_calendar(tmp_path)
    bake.check(tmp_path, "v1", expect="test-model", allow_empty=False)
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    monkeypatch.setenv("ASTRO_MODEL_VERSION", "test-model")

    with TestClient(app) as client:
        body = client.get("/api/version").json()

    assert body["model_version"] == "test-model"
    assert body["image_model_version"] == "test-model"
    assert body["build"]["dataset"] == "calendar/v1"


def test_api_version_without_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    monkeypatch.delenv("ASTRO_MODEL_VERSION", raising=False)

    with TestClient(app) as client:
        body = client.get("/api/version").json()

    assert body == {"model_version": None, "image_model_version": None, "build": None}
