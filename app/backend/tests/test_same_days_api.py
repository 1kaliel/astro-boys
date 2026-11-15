"""D5: the unfinished month is compared with the same days of earlier years (like for like).

A tiny calendar and a tiny `month_to_date` layer, made by hand, so every number can be checked on paper.
"""

from __future__ import annotations

from pathlib import Path

import duckdb
import pytest
from fastapi.testclient import TestClient

from astro_dashboard.main import app

# Cells A and B are inside FULL_BOX, cell C is far away.
CELLS = {"A": (-10.0, -40.0), "B": (-10.0, -39.75), "C": (-5.0, -45.0)}
FULL_BOX = {"west": -40.5, "south": -10.5, "east": -39.0, "north": -9.5}  # A and B, not C
# Same-days history, November days 1..14, per cell and period. 2019 only has cell C (outside the area).
HISTORY = {
    "A": {
        "D": {2020: 10, 2021: 20, 2022: 30, 2023: 40, 2024: 50},
        "N": {2020: 1, 2021: 2, 2022: 3, 2023: 4, 2024: 5},
    },
    "B": {"D": {2020: 5, 2021: 5, 2022: 5, 2023: 5, 2024: 5}, "N": {}},
    "C": {"D": {2019: 100, 2020: 100, 2021: 100, 2022: 100, 2023: 100, 2024: 100}, "N": {}},
}
HISTORY_YEARS = 6  # 2019..2024: n_years of the layer


def _write(
    root: Path,
    *,
    partial_days: int = 14,
    partial_estimated: bool = False,
    with_month_to_date: bool = True,
) -> None:
    con = duckdb.connect()
    con.execute(
        """CREATE TABLE t (cell_l2 VARCHAR, lat_min DOUBLE, lat_max DOUBLE, lon_min DOUBLE, lon_max DOUBLE,
           year INTEGER, month INTEGER, period VARCHAR, count_harmonized DOUBLE, var_harmonized DOUBLE,
           is_estimated BOOLEAN, is_partial BOOLEAN, days_observed INTEGER, origin VARCHAR,
           source_satellite VARCHAR, model_version VARCHAR)"""
    )
    rows = []
    for year in range(2019, 2027):
        partial = year == 2026
        for cell, (lat, lon) in CELLS.items():
            for period in ("ALL", "D", "N"):
                if cell == "C" or year != 2026:
                    count = 100.0  # complete Novembers and the far cell: irrelevant to the same-days history
                else:
                    count = {
                        "ALL": {"A": 14.0, "B": 5.0},
                        "D": {"A": 10.0, "B": 5.0},
                        "N": {"A": 4.0, "B": 0.0},
                    }[period][cell]
                est = partial and partial_estimated
                rows.append(
                    (
                        cell,
                        lat,
                        lat + 0.25,
                        lon,
                        lon + 0.25,
                        year,
                        11,
                        period,
                        count,
                        0.0,
                        est,
                        partial,
                        partial_days if partial else 30,
                        "VIIRS_OBSERVED",
                        "N20" if partial else "SNPP",
                        "test-model",
                    )
                )
    con.executemany("INSERT INTO t VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    for year in range(2019, 2027):
        folder = root / "processed" / "calendar" / "v1" / f"year={year}"
        folder.mkdir(parents=True, exist_ok=True)
        query = f"SELECT * EXCLUDE (year) FROM t WHERE year = {year}"
        con.execute(f"COPY ({query}) TO '{folder / 'data_0.parquet'}' (FORMAT parquet)")

    if with_month_to_date:
        con.execute(
            "CREATE TABLE m (cell_l2 VARCHAR, year INTEGER, month INTEGER, period VARCHAR, days INTEGER, "
            "n_hotspots BIGINT, n_years INTEGER)"
        )
        mtd = []
        for cell, periods in HISTORY.items():
            for period, by_year in periods.items():
                for year, n in by_year.items():
                    mtd.append((cell, year, 11, period, 14, n, HISTORY_YEARS))
        con.executemany("INSERT INTO m VALUES (?,?,?,?,?,?,?)", mtd)
        folder = root / "processed" / "month_to_date" / "v1"
        folder.mkdir(parents=True, exist_ok=True)
        con.execute(f"COPY m TO '{folder / 'data_0.parquet'}' (FORMAT parquet)")


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    _write(tmp_path)
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    with TestClient(app) as test_client:
        yield test_client


def _month(body: dict, year: int, month: int) -> dict:
    return next(m for m in body["months"] if m["year"] == year and m["month"] == month)


def test_the_unfinished_month_is_compared_with_the_same_days(client: TestClient) -> None:
    body = client.get("/api/calendar", params=FULL_BOX).json()

    november = _month(body, 2026, 11)
    # Area history per year (A day + A night + B day), 2019 with no row in the area counting as 0:
    # [0, 16, 27, 38, 49, 60] -> median 32.5, MAD 16.5. The month so far: A 14 + B 5 = 19.
    assert november["is_partial"] is True and november["count_harmonized"] == 19
    assert november["median_days"] == 14
    assert november["median_n_years"] == HISTORY_YEARS
    assert november["median_hist"] == 32.5
    assert november["anomaly_abs"] == -13.5
    assert november["anomaly_pct"] == -41.5
    assert november["anomaly_z"] == pytest.approx(-13.5 / (1.4826 * 16.5), abs=0.01)


def test_a_year_with_no_row_in_the_area_counts_as_zero(client: TestClient) -> None:
    # Without the zero for 2019 the history would be [16, 27, 38, 49, 60]: median 38, not 32.5.
    assert _month(client.get("/api/calendar", params=FULL_BOX).json(), 2026, 11)["median_hist"] != 38


def test_the_period_filter_uses_the_period_rows_of_the_history(client: TestClient) -> None:
    day = _month(client.get("/api/calendar", params={**FULL_BOX, "period": "D"}).json(), 2026, 11)
    night = _month(client.get("/api/calendar", params={**FULL_BOX, "period": "N"}).json(), 2026, 11)

    # Day history (A + B): [0, 15, 25, 35, 45, 55] -> median 30. The month so far by day: A 10 + B 5 = 15.
    assert day["median_hist"] == 30 and day["anomaly_abs"] == -15
    # Night history (A only): [0, 1, 2, 3, 4, 5] -> median 2.5. The month so far by night: A 4.
    assert night["median_hist"] == 2.5 and night["anomaly_abs"] == 1.5


def test_complete_months_keep_the_median_of_the_month(client: TestClient) -> None:
    body = client.get("/api/calendar", params=FULL_BOX).json()

    november_2025 = _month(body, 2025, 11)
    assert november_2025["is_partial"] is False
    # A full month is compared with full months: 100 + 100 in each of the 7 complete Novembers.
    assert november_2025["median_hist"] == 200 and november_2025["median_days"] is None
    assert november_2025["median_n_years"] == 7


def test_a_partial_month_with_other_days_is_not_compared(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write(tmp_path, partial_days=10)  # the layer holds days 1..14, this month only has 10
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    with TestClient(app) as client:
        november = _month(client.get("/api/calendar", params=FULL_BOX).json(), 2026, 11)

    assert november["median_days"] is None and november["median_hist"] is None
    assert november["anomaly_abs"] is None and november["anomaly_z"] is None  # never against full months


def test_an_estimated_partial_month_is_not_compared(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _write(tmp_path, partial_estimated=True)
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    with TestClient(app) as client:
        november = _month(client.get("/api/calendar", params=FULL_BOX).json(), 2026, 11)

    assert november["median_days"] is None and november["median_hist"] is None


def test_without_the_layer_a_partial_month_has_no_comparison(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write(tmp_path, with_month_to_date=False)
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    with TestClient(app) as client:
        response = client.get("/api/calendar", params=FULL_BOX)
        november = _month(response.json(), 2026, 11)

    assert response.status_code == 200  # the layer is optional: the app still works
    assert november["median_days"] is None and november["median_hist"] is None
    assert november["anomaly_abs"] is None
