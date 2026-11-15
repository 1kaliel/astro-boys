"""The Skyline's daily series: one sensor at a time, the main filter and the area, on the test hotspots."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import duckdb
import pytest
from fastapi.testclient import TestClient
from test_calendar_api import FULL_BOX, _write_calendar
from test_hotspots_api import _write_hotspots

from astro_dashboard import api, hotspots
from astro_dashboard.main import app

# coverage_daily of the test: every satellite, every day from 2004-12-01 to 2013-12-31 is `ok`, except these.
# Outside that span the table has no rows (the data ends): those days are not observed either.
COVERAGE_SPAN = (date(2004, 12, 1), date(2013, 12, 31))
GAPS = {
    ("SNPP", "2013-07-11"): "missing",  # an outage the day after h5: no detections, and not a zero
    ("SNPP", "2013-07-12"): "missing",
    ("SNPP", "2004-12-31"): "not_operating",  # S-NPP was not flying yet
}


def _write_coverage(root: Path, gaps: dict[tuple[str, str], str] = GAPS) -> Path:
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE c AS SELECT s.satellite, t.d::DATE AS date_local, 0::BIGINT AS n_all,"
        " 0::BIGINT AS n_nrt,"
        " 1.0::DOUBLE AS expected, 'ok' AS status"
        " FROM (VALUES ('SNPP'), ('N20'), ('Aqua'), ('Terra')) s(satellite),"
        " generate_series(?::DATE, ?::DATE, INTERVAL 1 DAY) t(d)",
        list(COVERAGE_SPAN),
    )
    for (satellite, day), status in gaps.items():
        con.execute(
            "UPDATE c SET status = ? WHERE satellite = ? AND date_local = ?", [status, satellite, day]
        )
    target = root / "processed" / "coverage_daily" / "v1"
    target.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY c TO '{(target / 'part-0.parquet').as_posix()}' (FORMAT parquet)")
    return target


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    _write_calendar(tmp_path)
    _write_hotspots(tmp_path)
    _write_coverage(tmp_path)
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    monkeypatch.delenv("ASTRO_HOTSPOTS_ROOT", raising=False)
    monkeypatch.delenv("ASTRO_COVERAGE_ROOT", raising=False)
    api._DAILY_CACHE.clear()
    hotspots.clear_coverage_cache()
    with TestClient(app) as test_client:
        yield test_client
    hotspots.clear_coverage_cache()


def _params(**extra: object) -> dict:
    return {**FULL_BOX, "start": "2000-01-01", "end": "2026-12-31", **extra}


def _days(body: dict) -> dict[str, int]:
    return {d["date"]: d["count"] for d in body["days"]}


def _missing(body: dict) -> dict[str, str]:
    return {d["date"]: d["status"] for d in body["missing_days"]}


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


def test_an_outage_day_is_no_data_not_a_zero(client: TestClient) -> None:
    body = client.get(
        "/api/hotspots/daily", params=_params(sensor="SNPP", start="2013-07-01", end="2013-07-31")
    ).json()
    assert body["coverage_checked"] is True
    assert _missing(body) == {"2013-07-11": "missing", "2013-07-12": "missing"}
    assert _days(body) == {"2013-07-09": 1, "2013-07-10": 1}
    assert not set(_missing(body)) & set(_days(body))


def test_not_operating_and_the_days_outside_the_coverage_table_are_no_data(client: TestClient) -> None:
    body = client.get(
        "/api/hotspots/daily", params=_params(sensor="SNPP", start="2004-12-30", end="2005-01-01")
    ).json()
    # 2004-12-30 is ok, on 2004-12-31 S-NPP was not flying; 2005-01-01 is ok
    assert _missing(body) == {"2004-12-31": "not_operating"}
    after = client.get(
        "/api/hotspots/daily", params=_params(sensor="SNPP", start="2013-12-30", end="2014-01-02")
    ).json()
    # 2014 is past the end of the coverage table: nobody can say the sensor was looking
    assert _missing(after) == {"2014-01-01": "not_operating", "2014-01-02": "not_operating"}
    aqua = client.get(
        "/api/hotspots/daily", params=_params(sensor="Aqua", start="2004-12-30", end="2005-01-01")
    ).json()
    assert _missing(aqua) == {} and _days(aqua) == {"2004-12-31": 1}  # the gap of one sensor is not another's


def test_detections_on_an_outage_day_are_never_counted(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A partial pass: the coverage says S-NPP was out on 2013-07-10, but h5 was recorded that day.
    other = _write_coverage(tmp_path / "other", {("SNPP", "2013-07-10"): "missing"})
    monkeypatch.setenv("ASTRO_COVERAGE_ROOT", str(other))
    body = client.get(
        "/api/hotspots/daily", params=_params(sensor="SNPP", start="2013-07-01", end="2013-07-31")
    ).json()
    assert _days(body) == {"2013-07-09": 1}
    assert body["missing_days"] == [{"date": "2013-07-10", "status": "missing", "count": 1}]


def test_unreadable_coverage_says_so_instead_of_claiming_zeros(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ASTRO_COVERAGE_ROOT", str(tmp_path / "nowhere"))
    body = client.get("/api/hotspots/daily", params=_params(sensor="SNPP")).json()
    assert body["coverage_checked"] is False
    assert body["missing_days"] == []
    assert _days(body) == {"2013-07-09": 1, "2013-07-10": 1}  # the detections are still real


def test_a_broken_coverage_file_is_unreadable_too(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    broken = tmp_path / "broken"
    broken.mkdir()
    (broken / "part-0.parquet").write_bytes(b"not parquet")
    monkeypatch.setenv("ASTRO_COVERAGE_ROOT", str(broken))
    assert (
        client.get("/api/hotspots/daily", params=_params(sensor="SNPP")).json()["coverage_checked"] is False
    )


@pytest.mark.parametrize(
    ("hotspots_root", "expected"),
    [
        ("gs://bucket/astro/processed/hotspots/v1", "gs://bucket/astro/processed/coverage_daily/v1"),
        ("gs://bucket/astro/processed/hotspots/v2/", "gs://bucket/astro/processed/coverage_daily/v2"),
        ("data/processed/hotspots/v1", "data/processed/coverage_daily/v1"),
        (r"D:\data\processed\hotspots\v1", "D:/data/processed/coverage_daily/v1"),
    ],
)
def test_the_coverage_root_is_the_sibling_of_the_hotspots_root(hotspots_root: str, expected: str) -> None:
    assert hotspots.sibling_coverage_root(hotspots_root) == expected


def test_an_unusual_hotspots_root_falls_back_to_the_data_root(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASTRO_DATA_ROOT", "gs://bucket/astro")
    assert hotspots.sibling_coverage_root("/mnt/somewhere") == "gs://bucket/astro/processed/coverage_daily/v1"


def test_the_coverage_root_follows_the_env_then_the_hotspots_root(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASTRO_HOTSPOTS_ROOT", "gs://bucket/astro/processed/hotspots/v1")
    monkeypatch.delenv("ASTRO_COVERAGE_ROOT", raising=False)
    assert hotspots.coverage_root() == "gs://bucket/astro/processed/coverage_daily/v1"
    monkeypatch.setenv("ASTRO_COVERAGE_ROOT", "gs://other/coverage/")
    assert hotspots.coverage_root() == "gs://other/coverage"
