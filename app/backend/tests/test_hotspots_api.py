"""D6: native hotspots of an area as CSV, on a tiny hand-made hotspots/v1 next to the test calendar."""

from __future__ import annotations

import csv
import io
from datetime import date
from pathlib import Path

import duckdb
import pytest
from fastapi.testclient import TestClient
from test_calendar_api import CELLS, FULL_BOX, _write_calendar

from astro_dashboard import hotspots
from astro_dashboard.calendar import Bounds
from astro_dashboard.main import app

# (id, cell, utc timestamp, local date, satellite, instrument, daynight, passes_main_filter)
ROWS = [
    ("h1", "A", "2005-03-01 15:00:00", "2005-03-01", "Aqua", "MODIS", "D", True),
    ("h2", "B", "2005-03-02 04:00:00", "2005-03-01", "Aqua", "MODIS", "N", True),
    ("h3", "A", "2005-03-03 15:00:00", "2005-03-03", "Aqua", "MODIS", "D", False),  # low confidence
    ("h4", "C", "2005-03-01 15:00:00", "2005-03-01", "Aqua", "MODIS", "D", True),  # outside the area
    ("h5", "A", "2013-07-10 16:00:00", "2013-07-10", "SNPP", "VIIRS", "D", True),
    ("h6", "B", "2013-07-09 05:00:00", "2013-07-09", "SNPP", "VIIRS", "N", True),
    ("h7", "A", "2004-12-31 15:00:00", "2004-12-31", "Aqua", "MODIS", "D", True),  # before the range
]


def _write_hotspots(root: Path) -> None:
    con = duckdb.connect()
    con.execute(
        """CREATE TABLE h (hotspot_id VARCHAR, latitude DOUBLE, longitude DOUBLE, acq_ts_utc TIMESTAMP,
           date_local DATE, month BIGINT, satellite VARCHAR, daynight VARCHAR, confidence_raw VARCHAR,
           confidence_class VARCHAR, frp_mw DOUBLE, brightness_mir_k DOUBLE, brightness_tir_k DOUBLE,
           delta_t_k DOUBLE, scan_km DOUBLE, track_km DOUBLE, type INTEGER, version VARCHAR,
           passes_main_filter BOOLEAN, cell_l1 VARCHAR, cell_l2 VARCHAR, cell_l3 VARCHAR, country VARCHAR,
           source_file VARCHAR, instrument VARCHAR, year BIGINT)"""
    )
    for hid, cell, ts, day, sat, instrument, dn, main in ROWS:
        lat, lon = CELLS[cell]
        con.execute(
            "INSERT INTO h VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 10.5, 330.1, 300.2, 29.9, 1.0, 1.0, 0, ?, ?,"
            " 'L1', ?, 'L3', 'Brazil', 'fire_archive.csv', ?, ?)",
            [hid, lat + 0.1, lon + 0.1, ts, day, int(day[5:7]), sat, dn, "n" if main else "l",
             "n" if main else "l", "6.1NRT" if instrument == "MODIS" else "2", main, cell, instrument,
             int(day[:4])],
        )
    target = root / "processed" / "hotspots" / "v1"
    target.parent.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY h TO '{target.as_posix()}' (FORMAT parquet, PARTITION_BY (instrument, year))")


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    _write_calendar(tmp_path)
    _write_hotspots(tmp_path)
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    monkeypatch.delenv("ASTRO_HOTSPOTS_ROOT", raising=False)
    monkeypatch.delenv("ASTRO_CSV_MAX_ROWS", raising=False)
    with TestClient(app) as test_client:
        yield test_client


def _params(**extra: object) -> dict:
    return {**FULL_BOX, "start": "2005-01-01", "end": "2013-12-31", **extra}


def _csv(response) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(response.text)))


def test_count_uses_the_calendar_cells_dates_and_main_filter(client: TestClient) -> None:
    body = client.get("/api/hotspots/count", params=_params()).json()

    # h1, h2, h5, h6: not h3 (fails the main filter), h4 (cell C), h7 (2004)
    assert body["rows"] == 4
    assert body["cells"] == 2
    assert body["max_rows"] == hotspots.DEFAULT_MAX_ROWS


def test_include_all_adds_rows_outside_the_main_filter(client: TestClient) -> None:
    assert client.get("/api/hotspots/count", params=_params(include_all="true")).json()["rows"] == 5


def test_period_filters_day_or_night(client: TestClient) -> None:
    assert client.get("/api/hotspots/count", params=_params(period="D")).json()["rows"] == 2
    assert client.get("/api/hotspots/count", params=_params(period="N")).json()["rows"] == 2


def test_dates_are_local_solar_dates_and_inclusive(client: TestClient) -> None:
    # h2 was acquired on 2005-03-02 UTC but its local solar date is 2005-03-01.
    body = client.get("/api/hotspots/count", params=_params(start="2005-03-01", end="2005-03-01")).json()
    assert body["rows"] == 2


def test_csv_has_the_contract_columns_in_time_order(client: TestClient) -> None:
    response = client.get("/api/hotspots.csv", params=_params())

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"] == (
        'attachment; filename="astro-hotspots_-40.5_-10.5_-39_-9.5_2005-01-01_2013-12-31.csv"'
    )
    assert response.text.splitlines()[0] == ",".join(hotspots.COLUMNS)
    rows = _csv(response)
    assert [r["hotspot_id"] for r in rows] == ["h1", "h2", "h6", "h5"]
    assert rows[0]["passes_main_filter"] == "true"
    assert rows[0]["acq_ts_utc"] == "2005-03-01T15:00:00"
    assert {r["instrument"] for r in rows} == {"MODIS", "VIIRS"}


def test_csv_with_no_match_is_only_the_header(client: TestClient) -> None:
    # 2013 is in the source, but its detections are in July.
    response = client.get("/api/hotspots.csv", params=_params(start="2013-01-01", end="2013-06-30"))

    assert response.status_code == 200
    assert response.text.splitlines() == [",".join(hotspots.COLUMNS)]


def test_years_missing_from_a_local_copy_are_a_503_not_zero(client: TestClient) -> None:
    # The fixture has 2004, 2005 and 2013 only: 2010 is missing data, not "no detections".
    for path in ("/api/hotspots/count", "/api/hotspots.csv"):
        response = client.get(path, params=_params(start="2010-01-01", end="2011-12-31"))
        assert response.status_code == 503
        assert response.json()["detail"] == (
            "The native hotspots of 2010-2011 are not on this server (it has: 2004, 2005, 2013)."
        )
    # A range that touches a year of the copy is counted from the years present.
    partly = _params(start="2010-01-01", end="2013-12-31")
    assert client.get("/api/hotspots/count", params=partly).status_code == 200


def test_too_many_rows_is_a_413_before_any_byte(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASTRO_CSV_MAX_ROWS", "3")

    response = client.get("/api/hotspots.csv", params=_params())

    assert response.status_code == 413
    assert "Narrow the area or the years" in response.json()["detail"]


def test_a_second_export_at_the_same_time_is_a_429(client: TestClient) -> None:
    assert hotspots._EXPORTS.acquire(blocking=False)
    try:
        response = client.get("/api/hotspots.csv", params=_params())
    finally:
        hotspots._EXPORTS.release()

    assert response.status_code == 429
    # The slot is free again once the other export ends.
    assert client.get("/api/hotspots.csv", params=_params()).status_code == 200


def _query(client: TestClient) -> hotspots.HotspotQuery:
    cells = client.app.state.calendar.cells_in(Bounds(**FULL_BOX))
    return hotspots.HotspotQuery(cells=cells, start=date(2005, 1, 1), end=date(2013, 12, 31))


def test_an_export_that_is_never_read_gives_its_slot_back(client: TestClient) -> None:
    # The client left before the first byte: the body was made and never read.
    body = hotspots.export_csv(_query(client))
    assert client.get("/api/hotspots.csv", params=_params()).status_code == 429  # the slot is taken

    del body

    assert client.get("/api/hotspots.csv", params=_params()).status_code == 200


def test_an_export_closed_halfway_gives_its_slot_back(client: TestClient) -> None:
    body = hotspots.export_csv(_query(client))
    next(body)
    body.close()
    body.close()  # closing twice does not free a second slot

    assert client.get("/api/hotspots.csv", params=_params()).status_code == 200
    assert hotspots._EXPORTS.acquire(blocking=False)
    hotspots._EXPORTS.release()


def test_bad_dates_or_area_are_422(client: TestClient) -> None:
    reversed_dates = _params(start="2013-01-01", end="2005-01-01")
    assert client.get("/api/hotspots/count", params=reversed_dates).status_code == 422
    far = {"west": 10, "south": 10, "east": 11, "north": 11, "start": "2005-01-01", "end": "2005-12-31"}
    assert client.get("/api/hotspots/count", params=far).status_code == 422


def test_missing_hotspots_is_a_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("ASTRO_HOTSPOTS_ROOT", str(tmp_path / "nowhere"))

    assert client.get("/api/hotspots/count", params=_params()).status_code == 503
    assert client.get("/api/hotspots.csv", params=_params()).status_code == 503
