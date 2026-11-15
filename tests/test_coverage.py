"""Coverage: outages are found from region-wide evidence; quiet days and single low days are not gaps."""

from __future__ import annotations

import duckdb
import pytest

from astro_fire import coverage


@pytest.fixture
def con():
    """Two satellites over 2020. B sees four times what A sees. A has a planted 5-day outage in August."""
    con = duckdb.connect()
    con.execute(
        """
        CREATE TABLE daily AS
        WITH days AS (
            SELECT unnest(generate_series(DATE '2020-01-01', DATE '2020-12-31', INTERVAL 1 DAY))::DATE AS d
        ),
        base AS (  -- busy from July to October, almost nothing otherwise
            SELECT d, CASE WHEN month(d) BETWEEN 7 AND 10 THEN 100 + dayofyear(d) % 7 * 10 ELSE 2 END AS a
            FROM days
        )
        SELECT 'A' AS satellite, d AS date_local, a AS n_all FROM base
        WHERE NOT d BETWEEN DATE '2020-08-10' AND DATE '2020-08-14'   -- outage
          AND d <> DATE '2020-09-20'                                   -- one isolated empty day
          AND NOT d BETWEEN DATE '2020-03-01' AND DATE '2020-03-10'   -- nothing recorded in a quiet period
        UNION ALL
        SELECT 'B', d, a * 4 FROM base WHERE d >= DATE '2020-02-15'    -- B starts operating on Feb 15
        """
    )
    coverage.flag_days(con, "daily")
    coverage.monthly(con, "coverage_daily")
    return con


def status(con, satellite, day):
    return con.execute(
        "SELECT status FROM coverage_daily WHERE satellite = ? AND date_local = ?::DATE", [satellite, day]
    ).fetchone()[0]


def test_sustained_absence_is_a_gap(con):
    assert {status(con, "A", f"2020-08-{d}") for d in range(10, 15)} == {"missing"}
    assert status(con, "A", "2020-08-09") == "ok" and status(con, "A", "2020-08-15") == "ok"
    assert coverage.gap_runs(con, "coverage_daily") == [
        {"satellite": "A", "first_day": "2020-08-10", "last_day": "2020-08-14", "days": 5,
         "detections": 0, "expected": pytest.approx(580, rel=0.2)}
    ]


def test_single_low_day_and_quiet_period_are_not_gaps(con):
    assert status(con, "A", "2020-09-20") == "ok"   # one day: ordinary variation
    assert status(con, "A", "2020-03-05") == "ok"   # ten empty days, but almost nothing was expected
    missing_b = "SELECT count(*) FROM coverage_daily WHERE satellite = 'B' AND status = 'missing'"
    assert con.execute(missing_b).fetchone() == (0,)


def test_days_before_the_first_detection_are_not_operating(con):
    assert status(con, "B", "2020-02-14") == "not_operating" and status(con, "B", "2020-02-15") == "ok"


def test_monthly_coverage(con):
    rows = con.execute(
        "SELECT satellite, month, days_in_month, days_missing, days_not_operating, days_observed, "
        "is_complete FROM coverage_monthly "
        "WHERE (satellite, month) IN (('A', 8), ('A', 9), ('B', 1), ('B', 2), ('B', 8)) ORDER BY 1, 2"
    ).fetchall()
    assert rows == [
        ("A", 8, 31, 5, 0, 26, False),   # 26 of 31 days: below 90%
        ("A", 9, 30, 0, 0, 30, True),
        ("B", 1, 31, 0, 31, 0, False),
        ("B", 2, 29, 0, 14, 15, False),
        ("B", 8, 31, 0, 0, 31, True),
    ]


def test_incomplete_months_reads_a_published_table(con, tmp_path):
    out = tmp_path / "coverage_monthly"
    out.mkdir()
    con.execute(f"COPY coverage_monthly TO '{out}/part-0.parquet' (FORMAT parquet)")
    assert coverage.incomplete_months(con, str(out), ("A",), (2020,)) == [(2020, 8, "A")]
    assert coverage.incomplete_months(con, str(out), ("A", "B"), (2020,)) == [
        (2020, 1, "B"), (2020, 2, "B"), (2020, 8, "A")
    ]
    assert coverage.incomplete_months(con, str(tmp_path / "nowhere"), ("A",), (2020,)) is None


def test_run_writes_both_tables_and_a_report(tmp_path):
    from astro_fire.config import get_settings

    hotspots = tmp_path / "processed" / "hotspots" / "v1"
    hotspots.mkdir(parents=True)
    duckdb.connect().execute(
        f"""COPY (
            SELECT CASE WHEN (i // 60) % 5 = 0 THEN 'A' ELSE 'B' END AS satellite,
                   (DATE '2020-07-01' + (i % 60)::INT) AS date_local
            FROM range(60000) t(i)
            WHERE NOT ((i // 60) % 5 = 0 AND (i % 60) BETWEEN 20 AND 25)
        ) TO '{hotspots}/data.parquet' (FORMAT parquet)"""
    )
    result = coverage.run(get_settings(astro_data_root=str(tmp_path), astro_dataset_version="v1"))
    assert result["status"] == "ok" and result["gap_runs"] == 1 and result["missing_days"] == 6
    assert (tmp_path / "processed" / "coverage_monthly" / "v1" / "part-0.parquet").is_file()
    assert (tmp_path / "processed" / "coverage_daily" / "v1" / "part-0.parquet").is_file()
