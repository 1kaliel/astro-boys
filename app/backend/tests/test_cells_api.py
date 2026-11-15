"""Map API (/api/cells) tests on a tiny calendar/v1 table written to tmp_path (no data files in git)."""

from __future__ import annotations

import duckdb
import pytest
from fastapi.testclient import TestClient

from astro_dashboard.main import app

# Three cells. (cell, lat_min, lon_min)
CELLS = [("G072131.11", -17.5, -48.5), ("G072131.12", -17.5, -48.25), ("G080140.01", -10.0, -40.0)]


def _write_calendar(root, rows, folder="v1") -> None:
    parent = root / "processed" / "calendar"
    parent.mkdir(parents=True, exist_ok=True)  # DuckDB creates the partition folders, not their parents
    out = (parent / folder).as_posix()
    with duckdb.connect() as con:
        con.execute("""
            CREATE TABLE cal (
                cell_l2 VARCHAR, lat_min DOUBLE, lat_max DOUBLE, lon_min DOUBLE, lon_max DOUBLE,
                year INTEGER, month INTEGER, period VARCHAR, count_harmonized DOUBLE, var_harmonized DOUBLE,
                origin VARCHAR, source_satellite VARCHAR, is_estimated BOOLEAN, is_nrt BOOLEAN,
                is_partial BOOLEAN, days_observed INTEGER, raw_aqua INTEGER, raw_terra INTEGER,
                raw_snpp INTEGER, raw_n20 INTEGER, model_version VARCHAR)
        """)
        con.executemany("INSERT INTO cal VALUES (" + ", ".join(["?"] * 21) + ")", rows)
        con.execute(f"COPY cal TO '{out}' (FORMAT PARQUET, PARTITION_BY (year))")


def _row(cell, lat, lon, year, month, value, *, var=0.0, estimated=False, raw_snpp=None, version="MOCK-test"):
    origin = "VIIRS_EQUIVALENT_FROM_MODIS" if estimated else "VIIRS_OBSERVED"
    source = "Aqua" if estimated else "SNPP"
    return (
        cell,
        lat,
        lat + 0.25,
        lon,
        lon + 0.25,
        year,
        month,
        "ALL",
        value,
        var,
        origin,
        source,
        estimated,
        False,
        False,
        31,
        None,
        None,
        raw_snpp,
        None,
        version,
    )


@pytest.fixture()
def client(tmp_path, monkeypatch):
    rows = []
    # January 2005 (estimated) and 2006 (estimated) for both inside cells; the outside cell burns a lot.
    for year, value in ((2005, 10.0), (2006, 30.0)):
        rows.append(_row(*CELLS[0], year, 1, value, var=4.0, estimated=True))
        rows.append(_row(*CELLS[1], year, 1, value / 2, var=1.0, estimated=True))
        rows.append(_row(*CELLS[2], year, 1, 1000.0, var=9.0, estimated=True))
    # January 2007: only the outside cell has detections -> the area total must be 0, not missing.
    rows.append(_row(*CELLS[2], 2007, 1, 500.0, var=9.0, estimated=True))
    # January 2013: observed by S-NPP.
    rows.append(_row(*CELLS[0], 2013, 1, 8.0, raw_snpp=8))
    _write_calendar(tmp_path, rows)
    # A different table in the mock folder: only used when ASTRO_DATASET_VERSION=mock.
    _write_calendar(tmp_path, [_row(*CELLS[1], 2010, 6, 77.0, version="MOCK")], folder="mock")
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    monkeypatch.delenv("ASTRO_DATASET_VERSION", raising=False)
    return TestClient(app)


def test_dataset_version_selects_the_calendar_folder(client, monkeypatch):
    assert client.get("/api/cells").json()["year"] == 2013  # default: calendar/v1
    monkeypatch.setenv("ASTRO_DATASET_VERSION", "mock")
    body = client.get("/api/cells").json()
    assert (body["year"], body["month"], body["model_version"]) == (2010, 6, "MOCK")
    assert body["simulated"] is True


def test_map_breaks_are_fixed_across_months_and_strictly_increasing(client):
    a = client.get("/api/cells", params={"year": 2005, "month": 1}).json()["breaks"]
    b = client.get("/api/cells", params={"year": 2013, "month": 1}).json()["breaks"]
    assert a == b  # one scale for every month
    assert 0 < len(a) <= 6
    assert all(x < y for x, y in zip(a, a[1:], strict=False))
    # Quantiles of the positive values in the whole table (1000 and 500 included), not of one month.
    assert a[-1] > 30


def test_dataset_version_cannot_escape_the_calendar_folder(client, monkeypatch):
    monkeypatch.setenv("ASTRO_DATASET_VERSION", "../v1")
    assert client.get("/api/cells").status_code == 503


def test_cells_default_to_the_latest_month_in_the_data(client):
    body = client.get("/api/cells").json()
    assert (body["year"], body["month"]) == (2013, 1)
    assert [c["id"] for c in body["cells"]] == ["G072131.11"]


def test_cells_for_month_lists_values_and_flags_simulated(client):
    body = client.get("/api/cells", params={"year": 2005, "month": 1}).json()
    assert body["simulated"] is True
    assert [c["id"] for c in body["cells"]] == ["G072131.11", "G072131.12", "G080140.01"]
    first = body["cells"][0]
    assert {k: first[k] for k in ("id", "value", "estimated", "partial")} == {
        "id": "G072131.11",
        "value": 10.0,
        "estimated": True,
        "partial": False,
    }
    # The 90% interval of an estimated cell: 10 +/- 1.645 * sqrt(4)
    assert first["ci_low"] == pytest.approx(10 - 1.645 * 2)
    assert first["ci_high"] == pytest.approx(10 + 1.645 * 2)
    assert body["series"] == "harmonized" and body["coverage"] == "ok"


def test_missing_data_root_returns_503(tmp_path, monkeypatch):
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path / "nothing"))
    response = TestClient(app).get("/api/cells", params={"year": 2005, "month": 1})
    assert response.status_code == 503


def test_invalid_period_and_month_are_rejected(client):
    assert client.get("/api/cells", params={"year": 2005, "month": 1, "period": "X"}).status_code == 422
    assert client.get("/api/cells", params={"year": 2005, "month": 13}).status_code == 422


def test_viirs_series_is_native_one_satellite_and_never_the_harmonized_value(client):
    body = client.get("/api/cells", params={"year": 2013, "month": 1, "series": "viirs"}).json()
    assert (body["series"], body["satellite"], body["coverage"]) == ("viirs", "SNPP", "ok")
    assert body["available_satellites"] == ["SNPP"]
    assert body["cells"] == [
        {"id": "G072131.11", "value": 8.0, "estimated": False, "partial": False, "satellite": "SNPP"}
    ]


def test_viirs_before_its_coverage_is_unavailable_not_empty_zero(client):
    body = client.get("/api/cells", params={"year": 2005, "month": 1, "series": "viirs"}).json()
    assert body["coverage"] == "none"
    assert body["cells"] == [] and "no data" in body["reason"]


def test_modis_series_needs_a_modis_satellite(client):
    assert (
        client.get(
            "/api/cells", params={"year": 2013, "month": 1, "series": "modis", "satellite": "SNPP"}
        ).status_code
        == 422
    )
    assert (
        client.get(
            "/api/cells", params={"year": 2013, "month": 1, "series": "harmonized", "satellite": "Aqua"}
        ).status_code
        == 422
    )
    assert client.get("/api/cells", params={"series": "x"}).status_code == 422


def test_native_breaks_are_their_own_scale(client):
    body = client.get("/api/cells", params={"year": 2013, "month": 1, "series": "viirs"}).json()
    assert body["breaks"] == [8.0] or all(
        x < y for x, y in zip(body["breaks"], body["breaks"][1:], strict=False)
    )
