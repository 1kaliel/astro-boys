"""Intervals come from measured out-of-year error and always contain the estimate."""

from __future__ import annotations

import duckdb
import pytest

from astro_fire import uncertainty as unc


@pytest.fixture
def con():
    """Out-of-year rows where the observation is the estimate times a known spread."""
    con = duckdb.connect()
    con.execute(
        """
        CREATE TABLE out_of_year AS
        SELECT 'c' || i AS cell_l2, 2012 + (i % 8) AS year, 1 + (i // 8) % 12 AS month, 'D' AS period,
               CASE WHEN i % 2 = 0 THEN 5 ELSE 0 END AS raw_aqua,
               CASE WHEN i % 2 = 0 THEN 40.0 ELSE 0.5 END AS estimate,
               CASE WHEN i % 2 = 0 THEN (20 + (i // 2) % 41)::BIGINT   -- 20..60 around 40
                    WHEN (i // 2) % 20 = 0 THEN 6::BIGINT              -- otherwise mostly zero
                    ELSE 0::BIGINT END AS observed
        FROM range(8000) t(i)
        """
    )
    unc.error_table(con, "out_of_year", min_rows=100)
    return con


def row(con, regime, bin_):
    return con.execute(
        "SELECT n_rows, bin_used, variance_ratio, q05_ratio, q95_ratio FROM uncertainty "
        "WHERE regime = ? AND period = 'D' AND bin = ?", [regime, bin_]
    ).fetchone()


def test_error_table_summarizes_by_regime_and_size(con):
    assert con.execute("SELECT count(*) FROM uncertainty").fetchone() == (2 * 3 * 14,)
    n, used, variance_ratio, q05, q95 = row(con, "aqua_positive", 5)   # estimate 40 is in [32, 64)
    assert (n, used) == (4000, 5)
    assert q05 == pytest.approx(22 / 40, abs=0.01) and q95 == pytest.approx(58 / 40, abs=0.01)
    assert variance_ratio == pytest.approx(140 / 40, rel=0.02)          # variance of 20..60 is 140
    n, used, _, q05, q95 = row(con, "aqua_zero", -1)                     # estimate 0.5 is in [0.5, 1)
    assert (n, used, q05) == (4000, -1, 0) and q95 == pytest.approx(0.6, abs=0.7)


def test_thin_bins_borrow_the_nearest_bin_with_enough_rows(con):
    assert row(con, "aqua_positive", 9)[:2] == (0, 5)
    assert row(con, "aqua_zero", 3)[:2] == (0, -1)


def test_intervals_contain_the_estimate_and_skip_unknown_rows(con):
    con.execute(
        "CREATE TABLE est AS SELECT * FROM (VALUES "
        "('x', 2005, 9, 'D', 7, 50.0), ('x', 2005, 9, 'N', 0, 0.6), "
        "('y', 2005, 9, 'D', 0, 0.0), ('z', 2005, 9, 'D', 3, NULL)) "
        "t(cell_l2, year, month, period, raw_aqua, estimate)"
    )
    unc.add_intervals(con, "est", "uncertainty")
    rows = con.execute("SELECT cell_l2, period, ci_low, ci_high, var_harmonized FROM estimates_ci "
                       "ORDER BY cell_l2, period").fetchall()
    assert rows[0][:2] == ("x", "D")
    assert rows[0][2] == pytest.approx(50 * 22 / 40, abs=0.5)
    assert rows[0][3] == pytest.approx(50 * 58 / 40, abs=0.5)
    assert rows[0][4] == pytest.approx(50 * 140 / 40, rel=0.02)
    assert rows[1][2:] == (None, None, None)       # night was never measured in this fixture
    assert rows[2][2:] == (None, None, None)       # an estimate of zero has no measured error
    assert rows[3][2:] == (None, None, None)       # a missing estimate stays missing


def test_upper_bound_is_never_below_the_estimate():
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE out_of_year AS SELECT 'c' || i AS cell_l2, 2012 + i % 8 AS year, 1 AS month, "
        "'N' AS period, 0 AS raw_aqua, 0.1 AS estimate, "
        "(CASE WHEN i % 50 = 0 THEN 4 ELSE 0 END)::BIGINT AS observed FROM range(1000) t(i)"
    )
    unc.error_table(con, "out_of_year", min_rows=100)
    con.execute("CREATE TABLE est AS SELECT 'c' AS cell_l2, 2005 AS year, 1 AS month, 'N' AS period, "
                "0 AS raw_aqua, 0.1 AS estimate")
    unc.add_intervals(con, "est", "uncertainty")
    assert con.execute("SELECT ci_low, ci_high FROM estimates_ci").fetchone() == (0.0, 0.1)


def test_coverage_counts_observations_inside_the_interval(con):
    con.execute("CREATE TABLE obs AS SELECT cell_l2, year, month, period, observed AS v FROM out_of_year")
    unc.add_intervals(con, "out_of_year", "uncertainty")
    overall = unc.coverage(con, "estimates_ci", "obs")[0]
    assert overall["regime"] is None and overall["n"] == 8000
    assert 0.90 <= overall["inside"] <= 0.97 and overall["inside"] + overall["below"] + overall["above"] == 1
