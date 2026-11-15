"""The mock calendar must have the contract's columns and behave like the real table would."""

from __future__ import annotations

import duckdb
import pytest

from astro_fire import mock
from astro_fire.config import get_settings


@pytest.fixture(scope="module")
def con():
    con = duckdb.connect()
    mock.build(con, (-46.0, -10.0, -45.0, -9.0))
    return con


def one(con, sql):
    return con.execute(sql).fetchone()


def violations(con, condition):
    """Number of mock rows for which `condition` holds."""
    return con.execute(f"SELECT count(*) FROM mock_calendar WHERE {condition}").fetchone()[0]


def test_columns_match_the_data_contract(con):
    assert [c[0] for c in con.execute("DESCRIBE mock_calendar").fetchall()] == list(mock.COLUMNS)
    assert one(con, "SELECT count(DISTINCT cell_l2), count(DISTINCT cell_l1) FROM mock_calendar") == (16, 1)
    assert one(con, "SELECT DISTINCT model_version FROM mock_calendar") == ("MOCK",)


def test_cell_ids_follow_the_grid_rule(con):
    # docs/spec/harmonization.md: lat -9.37, lon -45.62 is in G080134.10
    cell = one(con, "SELECT DISTINCT cell_l2 FROM mock_calendar WHERE lat_min = -9.5 AND lon_min = -45.75")
    assert cell == ("G080134.10",)
    assert violations(con, "cell_l2 NOT LIKE cell_l1 || '.%'") == 0


def test_estimated_before_february_2012_observed_after(con):
    assert violations(con, "is_estimated <> (year * 12 + month < 2012 * 12 + 2)") == 0
    assert violations(con, "is_estimated <> (origin = 'VIIRS_EQUIVALENT_FROM_MODIS')") == 0
    assert violations(con, "NOT is_estimated AND (ci_low <> count_harmonized "
                           "OR ci_high <> count_harmonized OR var_harmonized <> 0)") == 0
    assert violations(con, "is_estimated AND NOT (ci_low <= count_harmonized "
                           "AND count_harmonized <= ci_high AND ci_low >= 0)") == 0
    assert violations(con, "is_estimated AND raw_snpp IS NOT NULL") == 0
    assert violations(con, "is_estimated") > 0 and violations(con, "NOT is_estimated") > 0


def test_all_is_day_plus_night(con):
    bad = one(con, """
        SELECT count(*) FROM (
            SELECT cell_l2, year, month,
                   sum(count_harmonized) FILTER (WHERE period = 'ALL') AS total,
                   sum(count_harmonized) FILTER (WHERE period IN ('D', 'N')) AS parts
            FROM mock_calendar GROUP BY ALL)
        WHERE abs(coalesce(total, 0) - coalesce(parts, 0)) > 1e-9""")
    assert bad == (0,)


def test_current_month_is_partial_and_from_noaa20(con):
    rows = con.execute(
        "SELECT DISTINCT is_partial, days_observed, source_satellite, is_nrt FROM mock_calendar "
        "WHERE year = 2026 AND month = 11"
    ).fetchall()
    assert rows == [(True, 14, "N20", True)]
    assert violations(con, "year = 2026 AND month = 12") == 0
    assert violations(con, "is_partial AND NOT (year = 2026 AND month = 11)") == 0


def test_is_deterministic(con):
    other = duckdb.connect()
    mock.build(other, (-46.0, -10.0, -45.0, -9.0))
    sql = "SELECT count(*), sum(count_harmonized), sum(raw_aqua) FROM mock_calendar"
    assert one(other, sql) == one(con, sql)


def test_run_writes_partitioned_parquet_and_manifest(tmp_path):
    settings = get_settings(astro_data_root=str(tmp_path))
    result = mock.run(settings, (-46.0, -10.0, -45.0, -9.0))
    assert result["status"] == "ok" and result["synthetic"] is True
    out = tmp_path / "processed" / "calendar" / "mock"
    assert (out / "year=2008").is_dir()
    n = duckdb.connect().execute(
        f"SELECT count(*) FROM read_parquet('{out}/**/*.parquet', hive_partitioning = true)"
    ).fetchone()[0]
    assert n == result["rows"]


def test_bad_bbox_is_rejected():
    with pytest.raises(ValueError):
        mock.build(duckdb.connect(), (-44.0, -11.0, -47.0, -8.0))
