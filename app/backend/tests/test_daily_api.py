"""GET /api/daily: native detections of one satellite per local day of a month, with its passes, on a tiny
hand-made calendar and hotspots/v1."""

from __future__ import annotations

from pathlib import Path

import duckdb
import pytest
from fastapi.testclient import TestClient

from astro_dashboard import daily
from astro_dashboard.main import app

CELL = "G080140.01"  # the L2 cell at (-10, -40)
OUTSIDE = "G080141.01"  # not in the calendar, so never in the area
AREA = {"west": -40.0, "south": -10.0, "east": -39.8, "north": -9.8}  # local = UTC - 2 h 39.6

# (cell_l2, local date, UTC timestamp, satellite, instrument, daynight, passes_main_filter)
ROWS = [
    # 2013-09-05: a night pass, a day pass, and a second day pass after a gap of more than 20 minutes.
    (CELL, "2013-09-05", "2013-09-05 05:00:00", "SNPP", "VIIRS", "N", True),
    (CELL, "2013-09-05", "2013-09-05 05:03:00", "SNPP", "VIIRS", "N", True),
    (CELL, "2013-09-05", "2013-09-05 16:15:00", "SNPP", "VIIRS", "D", True),
    (CELL, "2013-09-05", "2013-09-05 16:10:00", "SNPP", "VIIRS", "D", True),
    (CELL, "2013-09-05", "2013-09-05 16:30:00", "SNPP", "VIIRS", "D", True),  # 15 min gap: same pass
    (CELL, "2013-09-05", "2013-09-05 16:51:00", "SNPP", "VIIRS", "D", True),  # 21 min gap: new pass
    (CELL, "2013-09-05", "2013-09-05 16:11:00", "SNPP", "VIIRS", "D", False),  # low confidence
    (CELL, "2013-09-05", "2013-09-05 15:20:00", "N20", "VIIRS", "D", True),  # another VIIRS satellite
    (CELL, "2013-09-05", "2013-09-05 15:22:00", "N20", "VIIRS", "D", True),
    (CELL, "2013-09-05", "2013-09-05 16:40:00", "Aqua", "MODIS", "D", True),  # MODIS in a VIIRS month
    # 2013-09-07: day/night changes within a minute: two passes.
    (CELL, "2013-09-07", "2013-09-07 16:00:00", "SNPP", "VIIRS", "D", True),
    (CELL, "2013-09-07", "2013-09-07 16:01:00", "SNPP", "VIIRS", "N", True),
    (OUTSIDE, "2013-09-10", "2013-09-10 16:00:00", "SNPP", "VIIRS", "D", True),  # outside the area
    (CELL, "2013-09-20", "2013-09-20 05:30:00", "SNPP", "VIIRS", "N", True),  # last S-NPP date of 2013
    (CELL, "2013-09-25", "2013-09-25 15:00:00", "N20", "VIIRS", "D", True),  # N20 goes on later
    (CELL, "2013-08-31", "2013-08-31 16:00:00", "SNPP", "VIIRS", "D", True),  # previous local month
    # March 2005, an Aqua month: Terra is never added to it.
    *[(CELL, "2005-03-02", "2005-03-02 16:40:00", "Aqua", "MODIS", "D", True)] * 2,
    *[(CELL, "2005-03-02", "2005-03-02 13:30:00", "Terra", "MODIS", "D", True)] * 3,
]

# (year, month, source satellite) of the calendar.
MONTHS = [(2005, 3, "Aqua"), (2013, 8, "SNPP"), (2013, 9, "SNPP"), (2014, 1, "SNPP")]  # no hotspots in 2014


def _write_calendar(root: Path) -> None:
    con = duckdb.connect()
    con.execute(
        """CREATE TABLE t (cell_l2 VARCHAR, lat_min DOUBLE, lon_min DOUBLE, year INTEGER, month INTEGER,
           period VARCHAR, count_harmonized DOUBLE, var_harmonized DOUBLE, is_estimated BOOLEAN,
           is_partial BOOLEAN, days_observed INTEGER, origin VARCHAR, source_satellite VARCHAR,
           model_version VARCHAR)"""
    )
    for year, month, sat in MONTHS:
        est = sat == "Aqua"
        origin = "VIIRS_EQUIVALENT_FROM_MODIS" if est else "VIIRS_OBSERVED"
        for period in ("ALL", "D", "N"):
            con.execute(
                "INSERT INTO t VALUES (?, -10.0, -40.0, ?, ?, ?, 6.0, 0.0, ?, false, 30, ?, ?, 'test-model')",
                [CELL, year, month, period, est, origin, sat],
            )
    for year in {y for y, _, _ in MONTHS}:
        folder = root / "processed" / "calendar" / "v1" / f"year={year}"
        folder.mkdir(parents=True, exist_ok=True)
        target = (folder / "data_0.parquet").as_posix()
        con.execute(
            f"COPY (SELECT * EXCLUDE (year) FROM t WHERE year = {year}) TO '{target}' (FORMAT parquet)"
        )


def _write_hotspots(root: Path) -> None:
    con = duckdb.connect()
    con.execute(
        """CREATE TABLE h (hotspot_id VARCHAR, acq_ts_utc TIMESTAMP, date_local DATE, satellite VARCHAR,
           daynight VARCHAR, passes_main_filter BOOLEAN, cell_l2 VARCHAR, instrument VARCHAR, year BIGINT)"""
    )
    for i, (l2, day, ts, sat, instrument, dn, main) in enumerate(ROWS):
        con.execute(
            "INSERT INTO h VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [f"h{i}", ts, day, sat, dn, main, l2, instrument, int(day[:4])],
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
    with TestClient(app) as test_client:
        yield test_client


def _get(client: TestClient, **params: object):
    return client.get("/api/daily", params={**AREA, "year": 2013, "month": 9, **params})


def _days(body: dict) -> dict[str, dict]:
    return {d["date"]: d for d in body["days"]}


def test_counts_per_day_of_one_satellite(client: TestClient) -> None:
    response = _get(client)

    assert response.status_code == 200
    body = response.json()
    assert (body["year"], body["month"], body["period"]) == (2013, 9, "ALL")
    assert (body["satellite"], body["instrument"], body["cells"]) == ("SNPP", "VIIRS", 1)
    assert [d["date"] for d in body["days"]] == [f"2013-09-{d:02d}" for d in range(1, 31)]
    days = _days(body)
    # Only main-filter S-NPP rows of the area: not low confidence, N20, Aqua, the other cell or August.
    assert days["2013-09-05"]["count"] == 4 + 2
    assert days["2013-09-07"]["count"] == 2
    assert days["2013-09-20"]["count"] == 1
    assert sum(d["count"] or 0 for d in body["days"]) == 9


def test_zero_day_is_observed_and_days_after_last_date_are_no_data(client: TestClient) -> None:
    body = _get(client).json()
    days = _days(body)

    assert body["last_date"] == "2013-09-20"
    assert days["2013-09-10"] == {"date": "2013-09-10", "status": "observed", "count": 0, "passes": []}
    assert days["2013-09-20"]["status"] == "observed"
    assert days["2013-09-21"] == {"date": "2013-09-21", "status": "no_data", "count": None, "passes": []}
    assert all(d["status"] == "no_data" for d in body["days"][20:])
    assert all(d["status"] == "observed" and d["count"] is not None for d in body["days"][:20])


def test_a_month_before_the_last_date_is_all_observed(client: TestClient) -> None:
    body = _get(client, month=8).json()

    assert body["last_date"] == "2013-09-20"
    assert all(d["status"] == "observed" for d in body["days"])
    assert _days(body)["2013-08-31"]["count"] == 1
    assert sum(d["count"] for d in body["days"]) == 1


def test_passes_split_by_gap_and_daynight(client: TestClient) -> None:
    days = _days(_get(client).json())

    assert days["2013-09-05"]["passes"] == [
        {"satellite": "SNPP", "daynight": "N", "start_utc": "05:00", "end_utc": "05:03",
         "start_local": "02:20", "end_local": "02:23", "count": 2},
        {"satellite": "SNPP", "daynight": "D", "start_utc": "16:10", "end_utc": "16:30",
         "start_local": "13:30", "end_local": "13:50", "count": 3},
        {"satellite": "SNPP", "daynight": "D", "start_utc": "16:51", "end_utc": "16:51",
         "start_local": "14:11", "end_local": "14:11", "count": 1},
    ]  # fmt: skip
    assert [(p["daynight"], p["count"]) for p in days["2013-09-07"]["passes"]] == [("D", 1), ("N", 1)]
    assert sum(p["count"] for p in days["2013-09-05"]["passes"]) == days["2013-09-05"]["count"]


def test_local_time_wraps_around_midnight() -> None:
    # 01:00 UTC at 60 degrees west is 21:00 local; 23:30 UTC at 45 degrees east is 02:30 local.
    assert daily.group_passes("SNPP", [("N", 3600.0)], -240)[0].start_local == "21:00"
    assert daily.group_passes("SNPP", [("N", 84600.0)], 180)[0].start_local == "02:30"


def test_period_filter(client: TestClient) -> None:
    night = _days(_get(client, period="N").json())
    assert night["2013-09-05"]["count"] == 2
    assert [p["daynight"] for p in night["2013-09-05"]["passes"]] == ["N"]
    assert night["2013-09-07"]["count"] == 1

    day = _get(client, period="D").json()
    assert day["period"] == "D"
    assert _days(day)["2013-09-05"]["count"] == 4
    assert _days(day)["2013-09-20"]["count"] == 0


def test_satellite_defaults_to_the_month_source_and_can_be_asked(client: TestClient) -> None:
    aqua = _get(client, year=2005, month=3).json()
    assert (aqua["satellite"], aqua["instrument"]) == ("Aqua", "MODIS")
    assert _days(aqua)["2005-03-02"]["count"] == 2  # the 3 Terra rows are not added

    terra = _get(client, year=2005, month=3, satellite="Terra").json()
    assert terra["satellite"] == "Terra"
    assert _days(terra)["2005-03-02"]["count"] == 3


def test_an_explicit_satellite_never_mixes_with_another(client: TestClient) -> None:
    body = _get(client, satellite="N20").json()

    assert (body["satellite"], body["instrument"]) == ("N20", "VIIRS")
    assert body["last_date"] == "2013-09-25"  # the last date is that satellite's own
    days = _days(body)
    assert days["2013-09-05"]["count"] == 2
    assert {p["satellite"] for p in days["2013-09-05"]["passes"]} == {"N20"}
    assert days["2013-09-25"]["count"] == 1
    assert days["2013-09-26"]["status"] == "no_data"
    assert sum(d["count"] or 0 for d in body["days"]) == 3


def test_area_with_no_cells_is_a_422(client: TestClient) -> None:
    response = _get(client, west=100, south=10, east=101, north=11)
    assert response.status_code == 422
    assert "overlaps no" in response.json()["detail"]


@pytest.mark.parametrize(
    "params",
    [
        {"month": 13},
        {"month": 0},
        {"period": "X"},
        {"satellite": "N21"},
        {"west": -39.8, "east": -40.0},
        {"year": 2010},  # a month the calendar does not have
    ],
)
def test_bad_parameters_are_a_422(client: TestClient, params: dict) -> None:
    assert _get(client, **params).status_code == 422


def test_a_missing_partition_is_a_503_not_zero(client: TestClient) -> None:
    # The calendar has January 2014 but hotspots/v1 has no VIIRS partition for 2014.
    assert _get(client, year=2014, month=1).status_code == 503


def test_missing_hotspots_is_a_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("ASTRO_HOTSPOTS_ROOT", str(tmp_path / "nowhere"))
    assert _get(client).status_code == 503
