"""The Skyline's daily series: one sensor at a time, the main filter and the area, on the test hotspots."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from test_calendar_api import FULL_BOX, _write_calendar
from test_hotspots_api import _write_hotspots

from astro_dashboard import api
from astro_dashboard.main import app


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    _write_calendar(tmp_path)
    _write_hotspots(tmp_path)
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    monkeypatch.delenv("ASTRO_HOTSPOTS_ROOT", raising=False)
    api._DAILY_CACHE.clear()
    with TestClient(app) as test_client:
        yield test_client


def _params(**extra: object) -> dict:
    return {**FULL_BOX, "start": "2000-01-01", "end": "2026-12-31", **extra}


def _days(body: dict) -> dict[str, int]:
    return {d["date"]: d["count"] for d in body["days"]}


def test_one_sensor_only_and_the_main_filter_and_the_area(client: TestClient) -> None:
    aqua = client.get("/api/hotspots/daily", params=_params(sensor="Aqua")).json()
    # Aqua rows in the box that pass the main filter: h1 and h2 (both 2005-03-01). h3 fails the filter,
    # h4 is outside the cells, h7 is an Aqua day but not in this test's range check below.
    assert _days(aqua) == {"2005-03-01": 2, "2004-12-31": 1}
    snpp = client.get("/api/hotspots/daily", params=_params(sensor="SNPP")).json()
    assert _days(snpp) == {"2013-07-09": 1, "2013-07-10": 1}
    assert snpp["sensor_name"] == "VIIRS S-NPP"


def test_a_sensor_is_never_added_to_another(client: TestClient) -> None:
    aqua = sum(_days(client.get("/api/hotspots/daily", params=_params(sensor="Aqua")).json()).values())
    snpp = sum(_days(client.get("/api/hotspots/daily", params=_params(sensor="SNPP")).json()).values())
    mixed = client.get("/api/hotspots/count", params=_params()).json()["rows"]
    assert aqua + snpp == mixed  # the count endpoint is all sensors; the daily one is never the sum of two


def test_the_period_filter_applies_to_the_daily_series(client: TestClient) -> None:
    night = client.get("/api/hotspots/daily", params=_params(sensor="Aqua", period="N")).json()
    assert _days(night) == {"2005-03-01": 1}  # h2 is the only night Aqua detection that passes the filter


def test_the_range_cuts_the_days(client: TestClient) -> None:
    body = client.get(
        "/api/hotspots/daily", params=_params(sensor="Aqua", start="2005-01-01", end="2013-12-31")
    ).json()
    assert _days(body) == {"2005-03-01": 2}  # 2004-12-31 is before the range


def test_an_unknown_sensor_is_rejected(client: TestClient) -> None:
    assert client.get("/api/hotspots/daily", params=_params(sensor="MODIS")).status_code == 422


def test_days_without_detections_are_not_in_the_answer_as_zeros(client: TestClient) -> None:
    body = client.get("/api/hotspots/daily", params=_params(sensor="SNPP")).json()
    assert all(d["count"] > 0 for d in body["days"])  # zero days are the chart's business, not invented rows


def test_the_answer_is_cached_for_six_hours(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []
    from astro_dashboard import hotspots as hs

    real = hs.daily

    def counting(*a, **k):  # noqa: ANN002, ANN003
        calls.append(1)
        return real(*a, **k)

    monkeypatch.setattr(hs, "daily", counting)
    client.get("/api/hotspots/daily", params=_params(sensor="SNPP"))
    client.get("/api/hotspots/daily", params=_params(sensor="SNPP"))
    assert len(calls) == 1


def test_no_hotspot_data_is_503_not_an_empty_chart(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ASTRO_HOTSPOTS_ROOT", str(tmp_path / "nowhere"))
    api._DAILY_CACHE.clear()
    assert client.get("/api/hotspots/daily", params=_params(sensor="SNPP")).status_code == 503
