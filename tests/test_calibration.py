"""Calibration: the worked example from the method notes, plus edge cases.

The example is didactic (four cells, September only): it checks the mechanism, not the method's skill.
"""

from __future__ import annotations

import math

import duckdb
import pytest

from astro_fire import calibration as cal

# cell: (Aqua, S-NPP) counts for September 2012, 2013, 2014, 2015
EXAMPLE = {
    "A": ([50, 60, 40, 50], [150, 190, 110, 150]),  # large fires
    "B": ([5, 3, 4, 8], [40, 30, 35, 55]),          # small agricultural burns
    "C": ([0, 1, 0, 0], [2, 6, 0, 1]),              # rare fire
    "D": ([0, 0, 0, 0], [3, 5, 2, 4]),              # never seen by MODIS
}
YEARS = [2012, 2013, 2014, 2015]
TEST_2016 = {"A": (55, 170), "B": (6, 45), "C": (0, 1), "D": (0, 4)}
AQUA_2008 = {"A": 45, "B": 6, "C": 0, "D": 0}


def _counts(con, rows):
    """Table shaped like cell_month_counts/v1; zero counts are left out, as in the real data."""
    con.execute(
        "CREATE OR REPLACE TABLE counts (cell_l2 VARCHAR, year INT, month INT, daynight VARCHAR, "
        "satellite VARCHAR, n_hotspots BIGINT)"
    )
    con.executemany("INSERT INTO counts VALUES (?, ?, ?, ?, ?, ?)", [r for r in rows if r[5] > 0])


@pytest.fixture
def con():
    con = duckdb.connect()
    rows = []
    for cell, (aqua, snpp) in EXAMPLE.items():
        for year, a, v in zip(YEARS, aqua, snpp, strict=True):
            rows += [(cell, year, 9, "D", "Aqua", a), (cell, year, 9, "D", "SNPP", v)]
    for cell, (a, v) in TEST_2016.items():
        rows += [(cell, 2016, 9, "D", "Aqua", a), (cell, 2016, 9, "D", "SNPP", v)]
    for cell, a in AQUA_2008.items():
        rows.append((cell, 2008, 9, "D", "Aqua", a))
    rows.append(("A", 2013, 9, "D", "Terra", 999))  # other satellites must be ignored
    _counts(con, rows)
    cal.build_panel(con, "counts", YEARS)
    return con


def _september(con, table, columns):
    rows = con.execute(
        f"SELECT cell_l2, {columns} FROM {table} WHERE month = 9 AND period = 'D' ORDER BY cell_l2"
    ).fetchall()
    return {r[0]: r[1:] for r in rows}


def test_panel_fills_zeros_for_universe_cells_only(con):
    # 4 cells × (4 years × 12 months − January 2012) × day/night
    assert con.execute("SELECT count(*) FROM panel").fetchone()[0] == 4 * (4 * 12 - 1) * 2
    assert con.execute("SELECT sum(a), sum(v) FROM panel").fetchone() == (221, 783)
    assert con.execute("SELECT a, v FROM panel WHERE cell_l2 = 'D' AND year = 2014 AND month = 9 "
                       "AND period = 'D'").fetchone() == (0, 2)


def test_partial_reference_month_is_excluded(con):
    assert con.execute("SELECT count(*) FROM panel WHERE year = 2012 AND month = 1").fetchone()[0] == 0
    assert con.execute("SELECT count(*) FROM panel WHERE year = 2013 AND month = 1").fetchone()[0] == 8


def test_factors_match_worked_example(con):
    cal.fit_factors(con, "panel", k=20, m=2)
    got = _september(con, "factors", "f, b, weight_cell, r_region, b_region")
    expected = {  # F, B, weight
        "A": (3.042, 2.429, 0.909),
        "B": (5.733, 2.429, 0.500),
        "C": (3.587, 1.571, 0.048),
        "D": (3.466, 3.143, 0.000),
    }
    for cell, (f, b, w) in expected.items():
        assert got[cell][0] == pytest.approx(f, abs=5e-4)
        assert got[cell][1] == pytest.approx(b, abs=5e-4)
        assert got[cell][2] == pytest.approx(w, abs=5e-4)
        assert got[cell][3] == pytest.approx(766 / 221)
        assert got[cell][4] == pytest.approx(17 / 7)
    years = con.execute("SELECT DISTINCT calibration_years FROM factors").fetchall()
    assert years == [("2012,2013,2014,2015",)]


def _abs_error_2016(con, k, m=2, use_background=True):
    cal.fit_factors(con, "panel", k=k, m=m)
    cal.build_source(con, "counts", "factors", [(2016, 9)])
    cal.apply_factors(con, "source", "factors", use_background=use_background)
    return con.execute(
        "SELECT sum(abs(o.n_hotspots - e.estimate)) FROM estimates e JOIN counts o "
        "ON o.cell_l2 = e.cell_l2 AND o.year = e.year AND o.month = e.month AND o.daynight = e.period "
        "AND o.satellite = 'SNPP' WHERE e.period = 'D'"
    ).fetchone()[0]


@pytest.mark.parametrize(
    ("k", "expected"), [(0, 9.4), (2, 6.7), (5, 8.2), (10, 11.3), (20, 14.7), (50, 18.0)]
)
def test_held_out_year_error_by_pooling_weight(con, k, expected):
    assert _abs_error_2016(con, k) == pytest.approx(expected, abs=0.05)


def test_background_helps_on_the_held_out_year(con):
    assert _abs_error_2016(con, 20, use_background=False) == pytest.approx(18.3, abs=0.05)
    assert _abs_error_2016(con, 20) < _abs_error_2016(con, 20, use_background=False)


def test_apply_to_a_modis_only_year(con):
    cal.fit_factors(con, "panel", k=20, m=2)
    cal.build_source(con, "counts", "factors", [(2008, 9)])
    cal.apply_factors(con, "source", "factors")
    got = _september(con, "estimates", "raw_aqua, estimate, estimate_rule")
    assert got["A"] == (45, pytest.approx(136.9, abs=0.05), "cell_factor")
    assert got["B"] == (6, pytest.approx(34.4, abs=0.05), "cell_factor")
    assert got["C"] == (0, pytest.approx(1.571, abs=5e-4), "background")
    assert got["D"] == (0, pytest.approx(3.143, abs=5e-4), "background")
    total = con.execute("SELECT sum(raw_aqua), sum(estimate) FROM estimates WHERE period = 'D'").fetchone()
    assert total == (51, pytest.approx(176.0, abs=0.05))


def test_unknown_cell_uses_regional_factor_and_gets_no_background(con):
    con.execute("INSERT INTO counts VALUES ('Z', 2008, 9, 'D', 'Aqua', 10), ('Z', 2008, 9, 'N', 'Aqua', 3)")
    cal.fit_factors(con, "panel", k=20, m=2)
    cal.build_source(con, "counts", "factors", [(2008, 9), (2008, 10)])
    cal.apply_factors(con, "source", "factors")
    rows = con.execute(
        "SELECT month, period, estimate, estimate_rule FROM estimates WHERE cell_l2 = 'Z' ORDER BY period"
    ).fetchall()
    # Day: regional ratio. Night: the region has no Aqua night detections, so there is no factor: null, not 0.
    assert rows == [
        (9, "D", pytest.approx(10 * 766 / 221), "regional_factor"),
        (9, "N", None, "regional_factor"),
    ]
    # A universe cell in a month with no detections at all gets its (zero) background, not a missing row.
    assert con.execute("SELECT estimate FROM estimates WHERE cell_l2 = 'D' AND month = 10 "
                       "AND period = 'D'").fetchone() == (0.0,)


def _poisson_deviance(v, mu):
    if v == 0:
        return 2 * mu
    return math.inf if mu <= 0 else 2 * (v * math.log(v / mu) - (v - mu))


def _add_second_parent(con):
    """Cells of another 1° parent with a different sensor ratio, so the two pooling levels differ."""
    rows = []
    for cell, ratio in (("G001001.01", 9), ("G001001.02", 7)):
        for i, year in enumerate(YEARS):
            a = (3 + i) if cell.endswith("01") else (i % 2)
            rows += [(cell, year, 9, "D", "Aqua", a), (cell, year, 9, "D", "SNPP", a * ratio + i + 1)]
    con.executemany("INSERT INTO counts VALUES (?, ?, ?, ?, ?, ?)", [r for r in rows if r[5] > 0])
    con.execute("UPDATE counts SET cell_l2 = 'G000000.0' || (ascii(cell_l2) - 64) WHERE length(cell_l2) = 1")
    cal.build_panel(con, "counts", YEARS)


@pytest.mark.parametrize("pool", cal.POOL_LEVELS)
def test_leave_one_year_out_matches_refitting(con, pool):
    _add_second_parent(con)
    scores = {s["weight"]: s for s in cal.leave_one_year_out(con, "panel", pool=pool)}
    assert sorted(scores) == list(cal.WEIGHT_GRID)
    for w in (0, 5, 50):
        pos, zero = [], []
        for held in YEARS:
            con.execute(f"CREATE OR REPLACE TEMP TABLE train AS SELECT * FROM panel WHERE year <> {held}")
            cal.fit_factors(con, "train", k=w, m=w, pool=pool, name="fold")
            for a, v, f, b in con.execute(
                f"SELECT p.a, p.v, f.f, f.b FROM panel p JOIN fold f USING (cell_l2, month, period) "
                f"WHERE p.year = {held}"
            ).fetchall():
                if a > 0 and f is not None:
                    pos.append((v, a * f))
                elif a == 0:
                    zero.append((v, b))
        for name, pairs in (("pos", pos), ("zero", zero)):
            n = len(pairs)
            assert scores[w][f"n_{name}"] >= n
            assert scores[w][f"mae_{name}"] == pytest.approx(sum(abs(v - mu) for v, mu in pairs) / n)
            assert scores[w][f"rmse_{name}"] == pytest.approx(
                math.sqrt(sum((v - mu) ** 2 for v, mu in pairs) / n)
            )
            deviance = sum(_poisson_deviance(v, mu) for v, mu in pairs) / n
            if math.isinf(deviance):
                assert scores[w][f"deviance_{name}"] is None  # infinite is reported as None
            else:
                assert scores[w][f"deviance_{name}"] == pytest.approx(deviance)


def test_parent_pooling_differs_from_region_pooling(con):
    _add_second_parent(con)
    cal.fit_factors(con, "panel", k=20, m=2, pool="region", name="by_region")
    cal.fit_factors(con, "panel", k=20, m=2, pool="l1", name="by_parent")
    sql = ("SELECT f, r_parent, r_region, pool_level FROM {} "
           "WHERE cell_l2 = 'G001001.02' AND month = 9 AND period = 'D'")
    f_region, target_region, r_region, level_region = con.execute(sql.format("by_region")).fetchone()
    f_parent, target_parent, r_region_2, level_parent = con.execute(sql.format("by_parent")).fetchone()
    assert (level_region, level_parent) == ("region", "l1")
    assert target_region == pytest.approx(r_region) and r_region == pytest.approx(r_region_2)
    # The parent's ratio is higher than the region's, so the thin cell is pulled further up.
    assert target_parent > target_region and f_parent > f_region


def test_without_pooling_the_deviance_is_infinite(con):
    # A cell seen by S-NPP in a single year: predicted from the other years with M = 0, its mean is exactly 0.
    con.execute("INSERT INTO counts VALUES ('E', 2014, 9, 'D', 'SNPP', 3)")
    cal.build_panel(con, "counts", YEARS)
    by_weight = {s["weight"]: s for s in cal.leave_one_year_out(con, "panel")}
    assert by_weight[0]["deviance_zero"] is None and by_weight[2]["deviance_zero"] is not None
    assert by_weight[0]["mae_zero"] is not None


def test_choose_weights_prefers_lowest_deviance_then_more_pooling():
    scores = [
        {"weight": 0, "deviance_pos": None, "deviance_zero": None, "mae_pos": 1.0, "mae_zero": 0.1},
        {"weight": 5, "deviance_pos": 2.0, "deviance_zero": 0.5, "mae_pos": 3.0, "mae_zero": 0.9},
        {"weight": 20, "deviance_pos": 2.0, "deviance_zero": 0.7, "mae_pos": 3.0, "mae_zero": 0.9},
    ]
    assert cal.choose_weights(scores) == (20, 5)
    assert cal.choose_weights(scores, metric="mae") == (0, 0)


def test_choose_pooling_returns_the_level_with_lower_deviance(con):
    _add_second_parent(con)
    choice = cal.choose_pooling(con, "panel", witness=False)
    assert choice["pool"] in cal.POOL_LEVELS and choice["k"] in cal.WEIGHT_GRID
    assert choice["witness"] is False and choice["m_witness"] is None
    static = [s for s in choice["scores"] if s["background"] == "static"]
    assert len(static) == len(cal.POOL_LEVELS) * len(cal.WEIGHT_GRID)
    totals = {}
    for pool in cal.POOL_LEVELS:
        rows = [s for s in static if s["pool"] == pool]
        k, m = cal.choose_weights(rows)
        by = {r["weight"]: r for r in rows}
        totals[pool] = (by[k]["deviance_pos"] * by[k]["n_pos"] + by[m]["deviance_zero"] * by[m]["n_zero"]) / (
            by[k]["n_pos"] + by[m]["n_zero"]
        )
    assert choice["deviance"] == pytest.approx(min(totals.values()))
    assert totals[choice["pool"]] == pytest.approx(min(totals.values()))


def test_negative_weights_are_rejected(con):
    with pytest.raises(ValueError):
        cal.fit_factors(con, "panel", k=-1, m=2)


@pytest.fixture
def witness_con():
    """Six cells of one parent, September, Aqua always 0. S-NPP sees 9 when Terra saw something, else 1."""
    con = duckdb.connect()
    rows = []
    for c in range(6):
        cell = f"G000000.{c + 1:02d}"
        for i, year in enumerate(YEARS):
            terra = (c + i) % 2  # alternates by cell and year
            rows.append((cell, year, 9, "D", "SNPP", 9 if terra else 1))
            if terra:
                rows.append((cell, year, 9, "D", "Terra", 2))
            rows += [(cell, year, 10, "D", "Aqua", 5 + i), (cell, year, 10, "D", "SNPP", 20 + 4 * i)]
    _counts(con, rows)
    cal.build_panel(con, "counts", YEARS, witness_gap_months=[(2015, 9)])
    return con


def test_panel_carries_the_witness_count_and_its_gaps(witness_con):
    con = witness_con
    assert con.execute("SELECT t FROM panel WHERE cell_l2 = 'G000000.01' AND month = 9 AND period = 'D' "
                       "ORDER BY year").fetchall() == [(0,), (2,), (0,), (None,)]
    assert con.execute("SELECT count(*) FROM panel WHERE t IS NULL").fetchone() == (6 * 2,)
    # The witness never adds cells: only Aqua or S-NPP detections define the panel.
    con.execute("INSERT INTO counts VALUES ('G000000.16', 2013, 9, 'D', 'Terra', 5)")
    cal.build_panel(con, "counts", YEARS)
    assert con.execute("SELECT count(DISTINCT cell_l2) FROM panel").fetchone() == (6,)


def test_witness_background_separates_active_from_quiet_months(witness_con):
    con = witness_con
    cal.fit_factors(con, "panel", k=5, m=0, pool="region", witness=True)
    b, b0, b1, n0, n1, sat = con.execute(
        "SELECT b, b_witness0, b_witness1, n_zero_witness0, n_zero_witness1, witness_satellite FROM factors "
        "WHERE cell_l2 = 'G000000.01' AND month = 9 AND period = 'D'"
    ).fetchone()
    assert (b0, b1, sat) == (1.0, 9.0, "Terra")
    assert (n0, n1) == (2, 1)                       # 2015 is a witness gap: not in either group
    assert b == pytest.approx((1 + 9 + 1 + 9) / 4)  # the static background still uses every year
    assert set(cal.WITNESS_COLUMNS) <= {r[0] for r in con.execute("DESCRIBE factors").fetchall()}


def test_witness_background_matches_the_generic_fit(witness_con):
    con = witness_con
    cal.witness_panel(con, "panel")
    for pool in cal.POOL_LEVELS:
        cal.fit_factors(con, "panel", k=5, m=2, pool=pool, witness=True, m_witness=5)
        cal.fit_factors(con, "panel_witness", k=5, m=5, pool=pool, name="generic")
        rows = con.execute(
            "SELECT f.b_witness0, g0.b, f.b_witness1, g1.b, f.m_witness FROM factors f "
            "JOIN generic g0 USING (cell_l2, month) JOIN generic g1 USING (cell_l2, month) "
            "WHERE g0.period = f.period || '|0' AND g1.period = f.period || '|1' "
            "AND f.month = 9 AND f.period = 'D'"
        ).fetchall()
        assert len(rows) == 6
        for b0, g0, b1, g1, m_w in rows:
            assert (b0, b1, m_w) == (pytest.approx(g0), pytest.approx(g1), 5)


def test_apply_uses_the_witness_when_it_is_known(witness_con):
    con = witness_con
    cal.fit_factors(con, "panel", k=5, m=0, pool="region", witness=True)
    con.execute("INSERT INTO counts VALUES ('G000000.01', 2008, 9, 'D', 'Terra', 4)")
    cal.build_source(con, "counts", "factors", [(2007, 9), (2008, 9), (2009, 9)],
                     witness_gap_months=[(2009, 9)])
    cal.apply_factors(con, "source", "factors")
    rows = con.execute("SELECT year, estimate, estimate_rule FROM estimates WHERE cell_l2 = 'G000000.01' "
                       "AND period = 'D' ORDER BY year").fetchall()
    assert rows == [
        (2007, 1.0, "background_witness_quiet"),
        (2008, 9.0, "background_witness_active"),
        (2009, 5.0, "background"),  # witness unknown: the static background
    ]
    cal.apply_factors(con, "source", "factors", use_background=False)
    assert con.execute("SELECT sum(estimate) FROM estimates").fetchone() == (0,)


def test_choose_pooling_picks_the_witness_when_it_lowers_the_deviance(witness_con):
    choice = cal.choose_pooling(witness_con, "panel")
    assert choice["witness"] is True and choice["m_witness"] in cal.WEIGHT_GRID
    assert choice["deviance_zero_witness"] < choice["deviance_zero_static_same_months"]
    assert cal.choose_pooling(witness_con, "panel", witness=False)["witness"] is False
    assert {s["background"] for s in choice["scores"]} == {"static", "witness"}
