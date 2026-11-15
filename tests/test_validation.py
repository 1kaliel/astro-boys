"""Validation: hand-checked numbers on the worked example, then the command end to end on synthetic counts."""

from __future__ import annotations

import json

import duckdb
import pytest

from astro_fire import calibration as cal
from astro_fire import cli, validate
from astro_fire import validation as val
from astro_fire.calibrate import CalibrationError
from test_calibrate_command import settings_for, write_counts
from test_calibration import EXAMPLE, TEST_2016, YEARS, _counts


@pytest.fixture
def con():
    """Worked example: calibrate on September 2012–2015 (K = 20, M = 2), test on 2016."""
    con = duckdb.connect()
    rows = []
    for cell, (aqua, snpp) in EXAMPLE.items():
        for year, a, v in zip(YEARS, aqua, snpp, strict=True):
            rows += [(cell, year, 9, "D", "Aqua", a), (cell, year, 9, "D", "SNPP", v)]
    for cell, (a, v) in TEST_2016.items():
        rows += [(cell, 2016, 9, "D", "Aqua", a), (cell, 2016, 9, "D", "SNPP", v)]
    rows += [("E", 2016, 9, "D", "SNPP", 7)]  # active only in the test year: outside the calibration universe
    _counts(con, rows)
    cal.build_panel(con, "counts", YEARS)
    cal.fit_factors(con, "panel", k=20, m=2)
    cal.build_panel(con, "counts", [2016], name="test_panel", exclude_months=())
    val.build_eval(con, "test_panel", "factors")
    val.predict(con, "panel", "factors", "eval")
    return con


def september(con, column):
    rows = con.execute(
        f"SELECT cell_l2, {column} FROM predictions WHERE month = 9 AND period = 'D' ORDER BY cell_l2"
    ).fetchall()
    return dict(rows)


def test_eval_covers_universe_and_test_only_cells(con):
    assert con.execute("SELECT count(*), count(DISTINCT cell_l2) FROM eval").fetchone() == (5 * 12 * 2, 5)
    assert con.execute("SELECT sum(a), sum(v) FROM eval").fetchone() == (61, 227)


def test_predictions_match_hand_calculation(con):
    ratio = 783 / 221  # all S-NPP over all Aqua in the calibration years
    assert september(con, "raw_aqua") == {"A": 55, "B": 6, "C": 0, "D": 0, "E": 0}
    expected = {"A": 55 * ratio, "B": 6 * ratio, "C": 0, "D": 0, "E": 0}
    assert september(con, "global_ratio") == pytest.approx(expected)
    assert september(con, "month_period_ratio") == pytest.approx(september(con, "global_ratio"))
    f_only = september(con, "f_pooled")
    assert f_only == pytest.approx({"A": 167.3, "B": 34.4, "C": 0, "D": 0, "E": 0}, abs=0.05)
    f_b = september(con, "f_pooled_background")
    # E is outside the calibration universe: no background is invented for it.
    assert f_b == pytest.approx({"A": 167.3, "B": 34.4, "C": 1.571, "D": 3.143, "E": 0}, abs=0.05)


def test_ols_matches_closed_form(con):
    pts = con.execute("SELECT a, v FROM panel").fetchall()
    n, sa, sv = len(pts), sum(a for a, _ in pts), sum(v for _, v in pts)
    slope = (n * sum(a * v for a, v in pts) - sa * sv) / (n * sum(a * a for a, _ in pts) - sa * sa)
    intercept = (sv - slope * sa) / n
    got = september(con, "ols")
    assert got["A"] == pytest.approx(slope * 55 + intercept)
    assert got["D"] == pytest.approx(max(0.0, intercept))


def test_scores_match_hand_calculation(con):
    scores = val.score(con, "predictions", season_months=[9])
    by = {(s["method"], s["level"], s["split"], s["value"]): s for s in scores}
    n = 5 * 12 * 2
    # Absolute errors in September by day (every other row is 0 observed, 0 predicted), plus cell E's 7.
    assert by["raw_aqua", "cell_month", "all", "all"]["mae"] == pytest.approx((115 + 39 + 1 + 4 + 7) / n)
    assert by["f_pooled", "cell_month", "all", "all"]["mae"] == pytest.approx((18.3 + 7) / n, abs=1e-3)
    final = by["f_pooled_background", "cell_month", "all", "all"]
    assert final["mae"] == pytest.approx((14.7 + 7) / n, abs=1e-3)
    assert (final["n"], final["n_missing"], final["sum_observed"]) == (n, 0, 227)
    assert by["f_pooled_background", "cell_month", "season", "high"]["n"] == 5 * 2
    assert by["f_pooled_background", "cell_month", "aqua", "positive"]["n"] == 2
    region = by["f_pooled_background", "region_month", "all", "all"]
    assert region["n"] == 12
    assert region["mae"] == pytest.approx(abs(167.3 + 34.4 + 1.571 + 3.143 - 227) / 12, abs=0.01)
    assert region["bias_rel"] == pytest.approx((167.3 + 34.4 + 1.571 + 3.143 - 227) / 227, abs=1e-3)


def test_missing_prediction_is_reported_not_zeroed(con):
    # Night: the region has no Aqua night detections in calibration, so a night Aqua count has no factor.
    con.execute("UPDATE eval SET a = 3, v = 9 WHERE cell_l2 = 'A' AND month = 9 AND period = 'N'")
    val.predict(con, "panel", "factors", "eval")
    assert con.execute("SELECT f_pooled, f_pooled_background, month_period_ratio FROM predictions "
                       "WHERE cell_l2 = 'A' AND month = 9 AND period = 'N'").fetchone() == (None, None, None)
    scores = val.score(con, "predictions")
    final = next(s for s in scores if s["method"] == val.FINAL and s["level"] == "cell_month"
                 and s["split"] == "all")
    assert (final["n"], final["n_missing"]) == (5 * 12 * 2 - 1, 1)
    region = [s for s in scores if s["method"] == val.FINAL and s["level"] == "region_month"
              and s["split"] == "all"][0]
    assert region["n_missing"] == 1  # the month with a missing cell has no regional total


def _scores(maes_cell, maes_region):
    return [
        {"method": k, "level": level, "split": "all", "value": "all", "mae": mae}
        for level, maes in (("cell_month", maes_cell), ("region_month", maes_region))
        for k, mae in maes.items()
    ]


def test_verdict_accepts_only_when_every_baseline_is_beaten_at_both_levels():
    base = {"raw_aqua": 9, "global_ratio": 3, "ols": 2.5, "month_period_ratio": 2.8, "f_pooled": 1.0}
    good = val.verdict(_scores({**base, val.FINAL: 2.0}, {**base, val.FINAL: 2.0}))
    assert good["accepted"] and good["ship"] == val.FINAL
    # Loses on regional totals: the best regional baseline ships, never the F-only ablation.
    bad = val.verdict(_scores({**base, val.FINAL: 2.0}, {**base, val.FINAL: 2.6}))
    assert not bad["accepted"] and bad["beats_baselines_cell_month_mae"] and bad["ship"] == "ols"
    region = {**base, "month_period_ratio": 2.1, val.FINAL: 2.0}
    worse = val.verdict(_scores({**base, val.FINAL: 2.7}, region))
    assert not worse["accepted"] and worse["beats_baselines_region_month_mae"] and worse["ship"] == "ols"
    assert worse["best_baseline_region_month_mae"] == "month_period_ratio"


def test_validate_command_end_to_end(tmp_path, capsys):
    write_counts(tmp_path)
    assert cli.main(["--data-root", str(tmp_path), "validate"]) == 0
    out = capsys.readouterr().out
    assert "| F with pooling + background B | candidate |" in out
    result = json.loads(out[out.index("\n{") :])
    report = json.loads(open(result["report"]).read())
    assert report["calibration_years"] == list(range(2012, 2020)) and report["test_years"] == [2020, 2021]
    assert report["eval"]["rows"] == 16 * 24 * 2
    assert {s["method"] for s in report["scores"]} == {key for key, _, _ in val.METHODS}
    assert report["verdict"]["ship"] in {key for key, _, _ in val.METHODS}
    table = open(result["table"]).read()
    assert "test years 2020–2021" in table and "NASA FIRMS" in table


def test_calibration_and_test_years_must_not_overlap(tmp_path):
    write_counts(tmp_path)
    with pytest.raises(CalibrationError, match="must not mix"):
        validate.run(settings_for(tmp_path), years=range(2012, 2021))
