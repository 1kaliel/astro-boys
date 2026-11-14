"""Calibration: the worked example from the method notes, plus edge cases.

The example is didactic (four cells, September only): it checks the mechanism, not the method's skill.
"""

from __future__ import annotations

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


def test_leave_one_year_out_matches_refitting(con):
    scores = {s["weight"]: s for s in cal.leave_one_year_out(con, "panel")}
    assert sorted(scores) == [0, 2, 5, 10, 20, 50]
    for w in (0, 5, 50):
        err_pos = err_zero = n_pos = n_zero = 0
        for held in YEARS:
            con.execute(f"CREATE OR REPLACE TEMP TABLE train AS SELECT * FROM panel WHERE year <> {held}")
            cal.fit_factors(con, "train", k=w, m=w, name="fold")
            for a, v, f, b in con.execute(
                f"SELECT p.a, p.v, f.f, f.b FROM panel p JOIN fold f USING (cell_l2, month, period) "
                f"WHERE p.year = {held}"
            ).fetchall():
                if a > 0 and f is not None:
                    err_pos, n_pos = err_pos + abs(v - a * f), n_pos + 1
                elif a == 0:
                    err_zero, n_zero = err_zero + abs(v - b), n_zero + 1
        assert scores[w]["mae_pos"] == pytest.approx(err_pos / n_pos)
        assert scores[w]["mae_zero"] == pytest.approx(err_zero / n_zero)


def test_choose_weights_prefers_lowest_error_then_more_pooling():
    scores = [
        {"weight": 0, "mae_pos": 3.0, "mae_zero": 1.0},
        {"weight": 5, "mae_pos": 2.0, "mae_zero": 0.5},
        {"weight": 20, "mae_pos": 2.0, "mae_zero": 0.7},
    ]
    assert cal.choose_weights(scores) == (20, 5)


def test_negative_weights_are_rejected(con):
    with pytest.raises(ValueError):
        cal.fit_factors(con, "panel", k=-1, m=2)
