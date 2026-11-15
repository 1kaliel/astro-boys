"""D2: `/api/calendar` on a tiny, hand-made calendar, so every number can be checked by hand."""

from __future__ import annotations

import math
from pathlib import Path

import duckdb
import pytest
from fastapi.testclient import TestClient

from astro_dashboard.main import app

# Cells are 0.25 degrees; lat_min/lon_min place them. Centers: A (-9.875, -39.875), B (-9.875, -39.625),
# C (-4.875, -44.875), which is far from A and B.
CELLS = {"A": (-10.0, -40.0), "B": (-10.0, -39.75), "C": (-5.0, -45.0)}
YEARS = range(2003, 2008)
# Count of cell A / cell B / cell C in January of 2003..2007.
JAN_A = [10, 20, 30, 40, 50]
JAN_B = [1, 2, 3, 4, 5]
FULL_BOX = {"west": -40.5, "south": -10.5, "east": -39.0, "north": -9.5}  # A and B, not C


def _write_calendar(
    root: Path,
    estimated_var: float | None = None,
    null_month: tuple[int, int] | None = None,
    null_cells: tuple[str, ...] = ("A", "B", "C"),
) -> None:
    """2003-2004 estimated (from MODIS), 2005-2007 observed. February 2007 is partial.

    February of 2005 only has a row for cell C, and February of 2006 has no row anywhere: the first is
    "zero in the area", the second is "no data".

    `null_month` adds an estimated month whose cells in `null_cells` have a null count (no estimate), like a
    month with incomplete MODIS coverage in the real calendar; the other cells keep a value.
    """
    con = duckdb.connect()
    con.execute(
        """CREATE TABLE t (cell_l2 VARCHAR, lat_min DOUBLE, lat_max DOUBLE, lon_min DOUBLE, lon_max DOUBLE,
           year INTEGER, month INTEGER, period VARCHAR, count_harmonized DOUBLE, var_harmonized DOUBLE,
           is_estimated BOOLEAN, is_partial BOOLEAN, days_observed INTEGER, origin VARCHAR,
           source_satellite VARCHAR, model_version VARCHAR)"""
    )
    rows = []

    def add(
        cell: str, year: int, month: int, period: str, count: float | None, partial: bool = False
    ) -> None:
        lat, lon = CELLS[cell]
        est = year <= 2004
        var = (estimated_var if est else 0.0)
        origin = "VIIRS_EQUIVALENT_FROM_MODIS" if est else "VIIRS_OBSERVED"
        sat = "Aqua" if est else "SNPP"
        rows.append((cell, lat, lat + 0.25, lon, lon + 0.25, year, month, period, count, var, est, partial,
                     10 if partial else 30, origin, sat, "test-model"))

    for i, year in enumerate(YEARS):
        add("A", year, 1, "ALL", JAN_A[i])
        add("B", year, 1, "ALL", JAN_B[i])
        add("C", year, 1, "ALL", 100)
        add("A", year, 1, "D", JAN_A[i] / 2)  # day is half of the total, for the period filter
    if null_month is not None:
        for cell in CELLS:
            add(cell, null_month[0], null_month[1], "ALL", None if cell in null_cells else 3)
    add("C", 2005, 2, "ALL", 7)  # February 2005: rows exist in the extent, none in the area
    add("A", 2007, 2, "ALL", 5, partial=True)
    add("B", 2007, 2, "ALL", 1, partial=True)
    add("C", 2007, 2, "ALL", 100, partial=True)
    con.executemany("INSERT INTO t VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    for year in YEARS:
        folder = root / "processed" / "calendar" / "v1" / f"year={year}"
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / "data_0.parquet"
        query = f"SELECT * EXCLUDE (year) FROM t WHERE year = {year}"
        con.execute(f"COPY ({query}) TO '{target}' (FORMAT parquet)")


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    _write_calendar(tmp_path)
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    with TestClient(app) as test_client:
        yield test_client


def _month(body: dict, year: int, month: int) -> dict | None:
    return next((m for m in body["months"] if m["year"] == year and m["month"] == month), None)


def test_sums_the_cells_of_the_area(client: TestClient) -> None:
    body = client.get("/api/calendar", params=FULL_BOX).json()

    assert body["area"]["cells"] == 2
    assert body["model_version"] == "test-model"
    assert _month(body, 2005, 1)["count_harmonized"] == 33  # A 30 + B 3, and not C
    assert body["first_year"] == 2003 and body["last_year"] == 2007


def test_the_area_is_the_cells_that_overlap_the_box(client: TestClient) -> None:
    # This box is inside cell A (lon -40.0 to -39.75): cell B starts at -39.75, so it is out.
    box = {"west": -39.95, "south": -9.95, "east": -39.8, "north": -9.8}
    body = client.get("/api/calendar", params=box).json()

    assert body["area"]["cells"] == 1
    assert _month(body, 2005, 1)["count_harmonized"] == 30


def test_a_box_that_only_touches_a_cell_edge_does_not_select_it(client: TestClient) -> None:
    # The east edge of the box is the west edge of cell B.
    box = {"west": -40.2, "south": -10.2, "east": -39.75, "north": -9.6}
    body = client.get("/api/calendar", params=box).json()

    assert body["area"]["cells"] == 1  # A only


def test_a_box_that_overlaps_part_of_two_cells_selects_both(client: TestClient) -> None:
    box = {"west": -39.8, "south": -9.9, "east": -39.7, "north": -9.8}
    body = client.get("/api/calendar", params=box).json()

    assert body["area"]["cells"] == 2  # A and B
    assert _month(body, 2005, 1)["count_harmonized"] == 33


def test_a_month_with_rows_elsewhere_counts_as_zero_in_the_area(client: TestClient) -> None:
    body = client.get("/api/calendar", params=FULL_BOX).json()

    february_2005 = _month(body, 2005, 2)
    assert february_2005 is not None
    assert february_2005["count_harmonized"] == 0


def test_a_month_with_no_row_anywhere_has_no_data(client: TestClient) -> None:
    body = client.get("/api/calendar", params=FULL_BOX).json()

    assert _month(body, 2006, 2) is None  # absent, never a zero


def test_estimated_months_have_no_interval_until_the_pipeline_delivers_it(client: TestClient) -> None:
    body = client.get("/api/calendar", params=FULL_BOX).json()

    estimated = _month(body, 2003, 1)
    assert estimated["is_estimated"] is True
    assert estimated["origin"] == "VIIRS_EQUIVALENT_FROM_MODIS"
    assert estimated["ci_low"] is None and estimated["ci_high"] is None  # pending, not zero


def test_observed_months_have_an_interval_equal_to_the_count(client: TestClient) -> None:
    observed = _month(client.get("/api/calendar", params=FULL_BOX).json(), 2005, 1)

    assert observed["is_estimated"] is False
    assert observed["ci_low"] == observed["ci_high"] == observed["count_harmonized"]


def test_the_interval_of_an_area_uses_the_summed_variance_times_n_to_the_0_32(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_calendar(tmp_path, estimated_var=4.0)
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    with TestClient(app) as client:
        estimated = _month(client.get("/api/calendar", params=FULL_BOX).json(), 2003, 1)

    # the variances of A and B added, times n^0.32 with n = 2 cells
    spread = 1.645 * math.sqrt((4.0 + 4.0) * 2**0.32)
    assert estimated["count_harmonized"] == 11
    assert estimated["ci_low"] == pytest.approx(11 - spread, abs=0.001)
    assert estimated["ci_high"] == pytest.approx(11 + spread, abs=0.001)


def test_a_partial_month_is_flagged_and_gets_no_anomaly(client: TestClient) -> None:
    body = client.get("/api/calendar", params=FULL_BOX).json()

    partial = _month(body, 2007, 2)
    assert partial["is_partial"] is True and partial["days_observed"] == 10
    assert partial["count_harmonized"] == 6
    assert partial["anomaly_abs"] is None and partial["anomaly_z"] is None


def test_median_and_anomalies_are_computed_on_the_sum(client: TestClient) -> None:
    body = client.get("/api/calendar", params=FULL_BOX).json()

    # January sums over the area: 11, 22, 33, 44, 55 -> median 33, MAD 11.
    assert body["baseline_years"] == [2003, 2007]
    january_2007 = _month(body, 2007, 1)
    assert january_2007["median_hist"] == 33
    assert january_2007["anomaly_abs"] == 22
    assert january_2007["anomaly_pct"] == 66.7
    assert january_2007["anomaly_z"] == pytest.approx(22 / (1.4826 * 11), abs=0.01)
    assert _month(body, 2005, 1)["anomaly_abs"] == 0


def test_a_median_over_too_few_years_is_not_shown(client: TestClient) -> None:
    body = client.get("/api/calendar", params=FULL_BOX).json()

    # February has a single complete month in the area (2005): nothing to take a median of.
    assert _month(body, 2005, 2)["median_hist"] is None


def test_the_baseline_years_can_be_chosen(client: TestClient) -> None:
    params = {**FULL_BOX, "baseline_start": 2005, "baseline_end": 2007}
    body = client.get("/api/calendar", params=params).json()

    january_2007 = _month(body, 2007, 1)
    assert body["baseline_years"] == [2005, 2007]
    assert january_2007["median_hist"] == 44  # median of 33, 44, 55


def test_the_period_filter_uses_the_period_rows(client: TestClient) -> None:
    body = client.get("/api/calendar", params={**FULL_BOX, "period": "D"}).json()

    assert body["period"] == "D"
    assert _month(body, 2005, 1)["count_harmonized"] == 15  # only cell A has a day row, half of 30


@pytest.mark.parametrize(
    "params",
    [
        {"west": -39.0, "south": -10.5, "east": -40.5, "north": -9.5},  # west after east
        {"west": -40.5, "south": -9.5, "east": -39.0, "north": -10.5},  # south after north
        {**FULL_BOX, "period": "X"},
        {**FULL_BOX, "baseline_start": 2005},
        {**FULL_BOX, "baseline_start": 2007, "baseline_end": 2005},
        {"west": -200, "south": -10.5, "east": -39.0, "north": -9.5},
    ],
)
def test_bad_requests_are_rejected(client: TestClient, params: dict) -> None:
    assert client.get("/api/calendar", params=params).status_code == 422


def test_an_area_without_cells_is_a_clear_error(client: TestClient) -> None:
    box = {"west": 100.0, "south": 0.0, "east": 101.0, "north": 1.0}
    response = client.get("/api/calendar", params=box)

    assert response.status_code == 422
    assert "overlaps no 0.25 degree cell" in response.json()["detail"]


def test_the_app_starts_without_data_and_says_so(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path / "nothing-here"))
    with TestClient(app) as client:
        assert client.get("/healthz").status_code == 200  # Cloud Run must still see a healthy app
        response = client.get("/api/calendar", params=FULL_BOX)

    assert response.status_code == 503
    assert "ASTRO_DATA_ROOT" in response.json()["detail"]


def test_one_cell_has_its_own_variance_and_is_not_marked_approximate(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_calendar(tmp_path, estimated_var=4.0)
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    box = {"west": -39.95, "south": -9.95, "east": -39.8, "north": -9.8}  # cell A only
    with TestClient(app) as client:
        body = client.get("/api/calendar", params=box).json()

    estimated = _month(body, 2003, 1)
    assert body["area"]["cells"] == 1
    assert body["interval_is_approximate"] is False
    assert estimated["ci_low"] == pytest.approx(10 - 1.645 * 2, abs=0.001)  # n = 1: n^0.32 = 1
    assert estimated["ci_high"] == pytest.approx(10 + 1.645 * 2, abs=0.001)


def test_an_area_of_several_cells_says_its_interval_is_approximate(client: TestClient) -> None:
    assert client.get("/api/calendar", params=FULL_BOX).json()["interval_is_approximate"] is True


def test_the_interval_is_wider_than_with_independent_cells(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_calendar(tmp_path, estimated_var=4.0)
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    with TestClient(app) as client:
        estimated = _month(client.get("/api/calendar", params=FULL_BOX).json(), 2003, 1)

    independent = 1.645 * math.sqrt(4.0 + 4.0)
    assert estimated["ci_high"] - estimated["count_harmonized"] > independent


def test_a_month_where_every_cell_has_no_estimate_has_no_count_not_zero(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_calendar(tmp_path, null_month=(2004, 3))
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    with TestClient(app) as client:
        body = client.get("/api/calendar", params=FULL_BOX).json()

    march = _month(body, 2004, 3)
    assert march is not None  # the month exists: it is flagged, not dropped
    assert march["count_harmonized"] is None
    assert march["ci_low"] is None and march["ci_high"] is None
    assert march["is_estimated"] is True
    assert march["anomaly_abs"] is None and march["anomaly_z"] is None


def test_a_month_where_only_some_cells_have_no_estimate_also_has_no_count(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Cell A has no estimate, cell B has 3: summing only B would understate the month.
    _write_calendar(tmp_path, null_month=(2004, 3), null_cells=("A",))
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    with TestClient(app) as client:
        body = client.get("/api/calendar", params=FULL_BOX).json()

    assert _month(body, 2004, 3)["count_harmonized"] is None


def test_a_month_without_an_estimate_does_not_change_the_median_of_the_others(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_calendar(tmp_path, null_month=(2004, 1))  # January 2004 has no estimate in any cell
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(tmp_path))
    with TestClient(app) as client:
        body = client.get("/api/calendar", params=FULL_BOX).json()

    # January sums over the area for 2003, 2005, 2006, 2007: 11, 33, 44, 55 (2004 is left out, not zero)
    assert _month(body, 2004, 1)["count_harmonized"] is None
    assert _month(body, 2007, 1)["median_hist"] == 38.5  # median of 11, 33, 44, 55


# ---------------------------------------------------------------------------------------------------------
# Months without an estimate, and the unfinished month against the same days of earlier years


def _add_rows(root: Path, year: int, name: str, rows: list[tuple]) -> None:
    """Add calendar rows (cell, month, period, count, estimated, partial, days) as one more file of `year`."""
    con = duckdb.connect()
    con.execute(
        """CREATE TABLE t (cell_l2 VARCHAR, lat_min DOUBLE, lat_max DOUBLE, lon_min DOUBLE, lon_max DOUBLE,
           month INTEGER, period VARCHAR, count_harmonized DOUBLE, var_harmonized DOUBLE,
           is_estimated BOOLEAN, is_partial BOOLEAN, days_observed INTEGER, origin VARCHAR,
           source_satellite VARCHAR, model_version VARCHAR)"""
    )
    for cell, month, period, count, estimated, partial, days in rows:
        lat, lon = CELLS[cell]
        origin = "VIIRS_EQUIVALENT_FROM_MODIS" if estimated else "VIIRS_OBSERVED"
        con.execute(
            "INSERT INTO t VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [cell, lat, lat + 0.25, lon, lon + 0.25, month, period, count, None if count is None else 0.0,
             estimated, partial, days, origin, "Aqua" if estimated else "SNPP", "test-model"],
        )  # fmt: skip
    folder = root / "processed" / "calendar" / "v1" / f"year={year}"
    folder.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY t TO '{folder / name}' (FORMAT parquet)")


def _write_month_to_date(
    root: Path, rows: list[tuple], month: int = 2, days: int = 10, n_years: int = 4
) -> None:
    """`rows` are (cell, year, period, n_hotspots): days 1..`days` of `month` in earlier years."""
    con = duckdb.connect()
    con.execute(
        """CREATE TABLE t (cell_l2 VARCHAR, year INTEGER, month INTEGER, period VARCHAR, days INTEGER,
           n_hotspots BIGINT, n_years INTEGER)"""
    )
    con.executemany(
        "INSERT INTO t VALUES (?,?,?,?,?,?,?)", [(c, y, month, p, days, n, n_years) for c, y, p, n in rows]
    )
    folder = root / "processed" / "month_to_date" / "v1"
    folder.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY t TO '{folder / 'part-0.parquet'}' (FORMAT parquet)")


# Days 1..10 of February in 2003..2006. Area (A + B), day + night, per year: 2003 -> 2 + 1 + 1 = 4,
# 2004 -> 8, 2005 -> no row in the area (only C) = 0, 2006 -> 10. Median of 0, 4, 8, 10 = 6, MAD = 3.
TO_DATE_ROWS = [
    ("A", 2003, "D", 2), ("A", 2003, "N", 1), ("B", 2003, "D", 1),
    ("A", 2004, "D", 8),
    ("C", 2005, "D", 50),
    ("B", 2006, "D", 7), ("B", 2006, "N", 3), ("C", 2006, "N", 9),
]  # fmt: skip


def _client_for(root: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("ASTRO_DATA_ROOT", str(root))
    return TestClient(app)


def test_an_estimated_partial_month_without_an_estimate_has_no_count(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_calendar(tmp_path)
    # March 2003: estimated and partial, no estimate in any cell (like July and August of 2002).
    _add_rows(tmp_path, 2003, "extra.parquet", [(c, 3, "ALL", None, True, True, 26) for c in CELLS])
    with _client_for(tmp_path, monkeypatch) as client:
        whole = _month(client.get("/api/calendar", params=FULL_BOX).json(), 2003, 3)
        # Cell C alone, and a month in which the area has no row at all: still no count, never zero.
        only_c = {"west": -45.2, "south": -5.2, "east": -44.8, "north": -4.8}
        single = _month(client.get("/api/calendar", params=only_c).json(), 2003, 3)

    for month in (whole, single):
        assert month["count_harmonized"] is None
        assert month["ci_low"] is None and month["ci_high"] is None
        assert month["anomaly_abs"] is None
        assert month["is_estimated"] is True and month["is_partial"] is True


def test_a_cell_without_an_estimate_leaves_the_area_sum_without_a_count(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_calendar(tmp_path)
    _add_rows(tmp_path, 2003, "extra.parquet", [("A", 3, "ALL", 12.0, True, False, 30),
                                               ("B", 3, "ALL", None, True, False, 30)])  # fmt: skip
    with _client_for(tmp_path, monkeypatch) as client:
        body = client.get("/api/calendar", params=FULL_BOX).json()
        only_a = client.get(
            "/api/calendar", params={"west": -39.95, "south": -9.95, "east": -39.8, "north": -9.8}
        ).json()

    assert _month(body, 2003, 3)["count_harmonized"] is None  # 12 alone would understate the area
    assert _month(only_a, 2003, 3)["count_harmonized"] == 12


def test_the_unfinished_month_is_compared_with_the_same_days_of_earlier_years(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_calendar(tmp_path)
    _write_month_to_date(tmp_path, TO_DATE_ROWS)
    with _client_for(tmp_path, monkeypatch) as client:
        body = client.get("/api/calendar", params=FULL_BOX).json()
        day = client.get("/api/calendar", params={**FULL_BOX, "period": "D"}).json()

    partial = _month(body, 2007, 2)
    assert partial["count_harmonized"] == 6 and partial["days_observed"] == 10
    assert partial["median_hist"] == 6  # 0, 4, 8, 10: the year without a row in the area counts as zero
    assert partial["median_n_years"] == 4 and partial["median_days"] == 10
    assert partial["anomaly_abs"] == 0 and partial["anomaly_pct"] == 0 and partial["anomaly_z"] == 0
    # A complete month keeps the full-month median, over whole months.
    january = _month(body, 2007, 1)
    assert january["median_hist"] == 33 and january["median_n_years"] == 5 and january["median_days"] is None
    # The fixture has no day row for February 2007, so the day series has no unfinished month to compare.
    assert all(m["median_days"] is None for m in day["months"])


def test_a_year_missing_from_the_whole_table_counts_as_zero(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_calendar(tmp_path)
    _write_month_to_date(tmp_path, TO_DATE_ROWS, n_years=5)  # five years, one with no row anywhere
    with _client_for(tmp_path, monkeypatch) as client:
        partial = _month(client.get("/api/calendar", params=FULL_BOX).json(), 2007, 2)

    assert partial["median_n_years"] == 5 and partial["median_hist"] == 4  # 0, 0, 4, 8, 10


def test_a_partial_month_never_gets_the_full_month_median(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_calendar(tmp_path)
    # A partial January: the full-month January median (33) exists, and must not be put next to it.
    _add_rows(tmp_path, 2008, "data_0.parquet", [("A", 1, "ALL", 3.0, False, True, 12)])
    _write_month_to_date(tmp_path, TO_DATE_ROWS, month=1, days=14)  # other days than the 12 observed
    with _client_for(tmp_path, monkeypatch) as client:
        partial = _month(client.get("/api/calendar", params=FULL_BOX).json(), 2008, 1)

    assert partial["count_harmonized"] == 3
    assert partial["median_hist"] is None and partial["median_n_years"] is None
    assert partial["anomaly_abs"] is None


# ---------------------------------------------------------------------------------------------------------
# Raw counts per satellite (D9): summed over the area, never across satellites


def _add_raw_rows(root: Path, year: int, rows: list[tuple]) -> None:
    """One more file of `year` with the raw columns: (cell, month, source, count, aqua, terra, snpp, n20)."""
    con = duckdb.connect()
    con.execute(
        """CREATE TABLE t (cell_l2 VARCHAR, lat_min DOUBLE, lat_max DOUBLE, lon_min DOUBLE, lon_max DOUBLE,
           month INTEGER, period VARCHAR, count_harmonized DOUBLE, var_harmonized DOUBLE,
           is_estimated BOOLEAN, is_partial BOOLEAN, days_observed INTEGER, origin VARCHAR,
           source_satellite VARCHAR, model_version VARCHAR, raw_aqua INTEGER, raw_terra INTEGER,
           raw_snpp INTEGER, raw_n20 INTEGER)"""
    )
    for cell, month, source, count, aqua, terra, snpp, n20 in rows:
        lat, lon = CELLS[cell]
        estimated = source == "Aqua"
        origin = "VIIRS_EQUIVALENT_FROM_MODIS" if estimated else "VIIRS_OBSERVED"
        con.execute(
            "INSERT INTO t VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [cell, lat, lat + 0.25, lon, lon + 0.25, month, "ALL", count, 0.0, estimated, False, 30, origin,
             source, "test-model", aqua, terra, snpp, n20],
        )  # fmt: skip
    folder = root / "processed" / "calendar" / "v1" / f"year={year}"
    folder.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY t TO '{folder / 'raw.parquet'}' (FORMAT parquet)")


def test_raw_counts_are_summed_per_satellite_and_never_across(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_calendar(tmp_path)
    _add_raw_rows(
        tmp_path,
        2008,
        [
            # June 2008, estimated from Aqua: VIIRS did not exist yet (null), Terra saw nothing in cell B.
            ("A", 6, "Aqua", 50.0, 10, 4, None, None),
            ("B", 6, "Aqua", 15.0, 3, 0, None, None),
            ("C", 6, "Aqua", 500.0, 100, 40, None, None),
            # July 2008: only cell C has a row; the area had no detection by the satellites that existed.
            ("C", 7, "Aqua", 500.0, 100, 40, None, None),
        ],
    )
    _add_raw_rows(
        tmp_path, 2013, [("A", 6, "SNPP", 70.0, 12, 5, 70, None), ("B", 6, "SNPP", 9.0, 1, 1, 9, None)]
    )
    with _client_for(tmp_path, monkeypatch) as client:
        body = client.get("/api/calendar", params=FULL_BOX).json()

    june_2008 = _month(body, 2008, 6)
    assert [june_2008[k] for k in ("raw_aqua", "raw_terra", "raw_snpp", "raw_n20")] == [13, 4, None, None]
    assert june_2008["raw_source"] == 13 and june_2008["count_harmonized"] == 65  # Aqua's own count
    july_2008 = _month(body, 2008, 7)
    # Zero for the satellites that existed, null for the one that did not.
    assert [july_2008[k] for k in ("raw_aqua", "raw_terra", "raw_snpp")] == [0, 0, None]
    june_2013 = _month(body, 2013, 6)
    # S-NPP's own count, with Aqua's next to it and never added to it.
    assert june_2013["raw_source"] == 79 and june_2013["raw_aqua"] == 13
    assert june_2013["raw_n20"] is None


def test_a_calendar_without_raw_columns_has_null_raw_counts(client: TestClient) -> None:
    january = _month(client.get("/api/calendar", params=FULL_BOX).json(), 2007, 1)

    assert january["raw_source"] is None and january["raw_aqua"] is None
