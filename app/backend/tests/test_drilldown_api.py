"""D11: L3 drill-down of one L2 cell, on a tiny hand-made calendar and hotspots/v1 with real grid ids."""

from __future__ import annotations

from pathlib import Path

import duckdb
import pytest
from fastapi.testclient import TestClient

from astro_dashboard import drilldown
from astro_dashboard.main import app

# Target: the south-west L2 cell of the 1 degree cell (-10, -40), so its block crosses both 1 degree edges.
TARGET = "G080140.01"
BLOCK = [
    "G079139.16", "G079140.13", "G079140.14",  # south row (the 1 degree cells below)
    "G080139.04", "G080140.01", "G080140.02",  # the target's row (west neighbor in the 1 degree cell west)
    "G080139.08", "G080140.05", "G080140.06",  # north row
]  # fmt: skip

# (cell_l2, cell_l3, local date, satellite, instrument, daynight, passes_main_filter)
ROWS = [
    *[(TARGET, f"{TARGET}.01", "2013-09-05", "SNPP", "VIIRS", "D", True)] * 4,
    *[(TARGET, f"{TARGET}.16", "2013-09-20", "SNPP", "VIIRS", "N", True)] * 2,
    (TARGET, f"{TARGET}.01", "2013-09-06", "SNPP", "VIIRS", "D", False),  # low confidence
    (TARGET, f"{TARGET}.02", "2013-09-06", "N20", "VIIRS", "D", True),  # another VIIRS satellite
    (TARGET, f"{TARGET}.03", "2013-09-06", "Aqua", "MODIS", "D", True),  # MODIS in a VIIRS month
    (TARGET, f"{TARGET}.04", "2013-10-01", "SNPP", "VIIRS", "D", True),  # next local month
    (TARGET, f"{TARGET}.04", "2013-08-31", "SNPP", "VIIRS", "N", True),  # previous local month
    *[("G079139.16", "G079139.16.16", "2013-09-10", "SNPP", "VIIRS", "N", True)] * 3,
    ("G080140.06", "G080140.06.01", "2013-09-11", "SNPP", "VIIRS", "D", True),
    *[("G080141.01", "G080141.01.01", "2013-09-11", "SNPP", "VIIRS", "D", True)] * 7,  # outside the block
    # March 2005, an Aqua month: Terra is never added to it.
    *[(TARGET, f"{TARGET}.06", "2005-03-02", "Aqua", "MODIS", "D", True)] * 3,
    *[(TARGET, f"{TARGET}.07", "2005-03-02", "Terra", "MODIS", "D", True)] * 4,
]

# (year, month, source satellite) of the calendar.
MONTHS = [(2005, 3, "Aqua"), (2013, 9, "SNPP"), (2014, 1, "SNPP")]  # no hotspots in 2014


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
                [TARGET, year, month, period, est, origin, sat],
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
        """CREATE TABLE h (hotspot_id VARCHAR, date_local DATE, satellite VARCHAR, daynight VARCHAR,
           passes_main_filter BOOLEAN, cell_l2 VARCHAR, cell_l3 VARCHAR, instrument VARCHAR, year BIGINT)"""
    )
    for i, (l2, l3, day, sat, instrument, dn, main) in enumerate(ROWS):
        con.execute(
            "INSERT INTO h VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [f"h{i}", day, sat, dn, main, l2, l3, instrument, int(day[:4])],
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
    return client.get("/api/drilldown", params={"cell": TARGET, "year": 2013, "month": 9, **params})


def _counts(cells: list[dict]) -> dict[str, int]:
    return {c["id"]: c["count"] for c in cells}


def test_neighbors_inside_a_1_degree_cell() -> None:
    assert drilldown.neighbors("G080140.06") == [f"G080140.{k:02d}" for k in (1, 2, 3, 5, 6, 7, 9, 10, 11)]


def test_neighbors_cross_1_degree_edges() -> None:
    assert drilldown.neighbors(TARGET) == BLOCK
    # North-east corner of a 1 degree cell: the block reaches into three other 1 degree cells.
    assert drilldown.neighbors("G080140.16") == [
        "G080140.11", "G080140.12", "G080141.09",
        "G080140.15", "G080140.16", "G080141.13",
        "G081140.03", "G081140.04", "G081141.01",
    ]  # fmt: skip


def test_neighbors_wrap_the_antimeridian_and_stop_at_the_poles() -> None:
    assert drilldown.neighbors("G000000.01") == [
        "G000359.04", "G000000.01", "G000000.02",
        "G000359.08", "G000000.05", "G000000.06",
    ]  # fmt: skip


def test_l2_id_round_trips() -> None:
    for cell in ("G000000.01", "G080140.07", "G179359.16"):
        assert drilldown.l2_id(*drilldown.l2_index(cell)) == cell


def test_counts_per_l3_and_per_neighbor(client: TestClient) -> None:
    response = _get(client)

    assert response.status_code == 200
    body = response.json()
    assert body["cell"] == TARGET
    assert (body["year"], body["month"], body["period"]) == (2013, 9, "ALL")
    assert (body["satellite"], body["instrument"]) == ("SNPP", "VIIRS")
    assert body["min_detections"] == 5
    # Only the main-filter S-NPP rows of September: not low confidence, N20, Aqua, or the next month.
    assert body["total"] == 6
    assert body["subdivided"] is True
    assert body["l3"] == [{"id": f"{TARGET}.01", "count": 4}, {"id": f"{TARGET}.16", "count": 2}]
    assert sum(c["count"] for c in body["l3"]) == body["total"]
    assert [c["id"] for c in body["neighbors"]] == BLOCK
    counts = _counts(body["neighbors"])
    assert counts[TARGET] == 6
    assert counts["G079139.16"] == 3  # across both 1 degree edges
    assert counts["G080140.06"] == 1
    assert sum(counts.values()) == 10  # zero for the others; G080141.01 is outside the block


def test_day_or_night_filter_and_the_stop_rule(client: TestClient) -> None:
    day = _get(client, period="D").json()
    assert day["total"] == 4
    assert day["subdivided"] is False  # fewer than 5 detections: no L3
    assert day["l3"] == []
    assert _counts(day["neighbors"])["G080140.06"] == 1

    night = _get(client, period="N").json()
    assert night["total"] == 2
    assert _counts(night["neighbors"])["G079139.16"] == 3
    assert night["period"] == "N"


def test_a_modis_month_counts_only_aqua(client: TestClient) -> None:
    body = _get(client, year=2005, month=3).json()

    assert (body["satellite"], body["instrument"]) == ("Aqua", "MODIS")
    assert body["total"] == 3  # the 4 Terra rows are not added
    assert body["subdivided"] is False
    assert body["l3"] == []


@pytest.mark.parametrize(
    "cell",
    [
        "G080140.01.01",
        "abc",
        "",
        "G080140.00",
        "G080140.17",
        "G180000.01",
        "G000360.01",
        "G080140",
        "g080140.01",
    ],
)
def test_not_an_l2_id_is_a_422(client: TestClient, cell: str) -> None:
    assert _get(client, cell=cell).status_code == 422


def test_an_l3_id_says_l3_is_the_deepest_level(client: TestClient) -> None:
    response = _get(client, cell=f"{TARGET}.01")
    assert response.status_code == 422
    assert "deepest level" in response.json()["detail"]


@pytest.mark.parametrize(
    "params", [{"month": 13}, {"month": 0}, {"year": 1999}, {"year": "x"}, {"period": "X"}, {"year": 2010}]
)
def test_bad_year_month_or_period_is_a_422(client: TestClient, params: dict) -> None:
    assert _get(client, **params).status_code == 422  # 2010: a month the calendar does not have


def test_missing_hotspots_is_a_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("ASTRO_HOTSPOTS_ROOT", str(tmp_path / "nowhere"))

    assert _get(client).status_code == 503


def test_a_missing_partition_is_a_503_not_zero(client: TestClient) -> None:
    # The calendar has January 2014 but hotspots/v1 has no VIIRS partition for 2014.
    assert _get(client, year=2014, month=1).status_code == 503
