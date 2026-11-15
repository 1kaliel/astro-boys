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
    # No witness background was fitted in this example: the final method equals the static one.
    assert september(con, "f_pooled_static_background") == september(con, "f_pooled_background")
    assert september(con, "f_pooled_witness_background") == september(con, "f_pooled_background")
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


def _scores(cell, region):
    return [
        {"method": k, "level": level, "split": "all", "value": "all", "mae": mae, "rmse": mae * 3}
        for level, maes in (("cell_month", cell), ("region_month", region))
        for k, mae in maes.items()
    ]


def _regional(low, high, baseline="ols"):
    return {"baseline": baseline, "months": 24, "mean": (low + high) / 2, "ci90_low": low, "ci90_high": high}


def test_verdict_follows_the_written_rule():
    base = {"raw_aqua": 9, "global_ratio": 3, "ols": 2.5, "month_period_ratio": 2.8, "f_pooled": 1.0}
    better = {**base, val.FINAL: 2.0}
    # Better per cell, and regionally better or a tie: pass.
    assert val.verdict(_scores(better, better), _regional(-5, -1))["accepted"]
    tie = val.verdict(_scores(better, {**base, val.FINAL: 2.6}), _regional(-3, 4))
    assert tie["accepted"] and tie["ship"] == val.FINAL
    assert not tie["region_month_lower_mae_than_every_baseline"]  # the strict comparison is still reported
    # Distinguishably worse on regional totals: the regional baseline ships, never the F-only ablation.
    worse = val.verdict(_scores(better, {**base, val.FINAL: 2.6}), _regional(1, 4))
    assert not worse["accepted"] and worse["ship"] == "ols"
    # Not better per cell: fail, the best cell-level baseline ships.
    cell_fail = val.verdict(_scores({**base, val.FINAL: 2.7}, better), _regional(-5, -1))
    assert not cell_fail["accepted"] and cell_fail["ship"] == "ols"
    assert "coverage-adequate" in cell_fail["rule"]


def test_regional_difference_is_paired_by_month(con):
    diff = val.regional_difference(con, "predictions", "global_ratio")
    assert diff["months"] == 12 and diff["baseline"] == "global_ratio"
    # Only September has detections: final misses the regional total by ~20.6, the global ratio by ~10.9.
    final_err = abs(167.3 + 34.4 + 1.571 + 3.143 - 227)
    ratio_err = abs(61 * 783 / 221 - 227)
    assert diff["mean"] == pytest.approx((final_err - ratio_err) / 12, abs=0.01)
    assert diff["ci90_low"] <= diff["mean"] <= diff["ci90_high"]
    assert val.regional_difference(con, "predictions", "global_ratio") == diff  # seeded: reproducible


def test_validate_command_end_to_end(tmp_path, capsys):
    write_counts(tmp_path)
    assert cli.main(["--data-root", str(tmp_path), "validate"]) == 0
    out = capsys.readouterr().out
    assert "| Final: F + background B, as fitted (Terra-aware, reconciled) | candidate |" in out
    assert "| F + Terra-aware background B, not reconciled | ablation |" in out
    assert "| F + static background B | ablation |" in out and "development years 2020–2021" in out
    result = json.loads(out[out.index("\n{") :])
    report = json.loads(open(result["report"]).read())
    assert report["stage"] == "development"
    assert report["calibration_years"] == list(range(2012, 2020)) and report["test_years"] == [2020, 2021]
    assert report["eval"]["rows"] == 16 * 24 * 2 and report["incomplete_months_left_out"] == []
    assert {s["method"] for s in report["scores"]} == {key for key, _, _ in val.METHODS}
    assert report["verdict"]["rule"] == val.RULE and "late_years" not in report
    overall = report["interval_coverage_90pct"][0]
    assert overall["regime"] is None and overall["n"] > 0 and 0 <= overall["inside"] <= 1
    assert "NASA FIRMS" in open(result["table"]).read()


def test_final_test_years_are_locked_until_asked_for(tmp_path, capsys):
    write_counts(tmp_path)
    with pytest.raises(CalibrationError, match="final test"):
        validate.run(settings_for(tmp_path), test_years=[2021, 2022])
    with pytest.raises(CalibrationError, match="final test"):
        validate.run(settings_for(tmp_path), test_years=[2024])
    with pytest.raises(CalibrationError, match="do not pass test years"):
        validate.run(settings_for(tmp_path), test_years=[2022], final=True)
    assert cli.main(["--data-root", str(tmp_path), "validate", "--final"]) == 0
    out = capsys.readouterr().out
    assert "final test 2022–2023" in out and "late years (reported separately) 2024–2025" in out
    report = json.loads(open(json.loads(out[out.index("\n{") :])["report"]).read())
    assert report["stage"] == "final test" and report["test_years"] == [2022, 2023]
    assert report["late_years"]["test_years"] == [2024, 2025]


def test_incomplete_test_months_are_scored_separately(tmp_path):
    write_counts(tmp_path)
    out = tmp_path / "processed" / "coverage_monthly" / "v1"
    out.mkdir(parents=True)
    duckdb.connect().execute(
        f"COPY (SELECT 'Aqua' AS satellite, 2020 AS year, 8 AS month, false AS is_complete) "
        f"TO '{out}/part-0.parquet' (FORMAT parquet)"
    )
    result = validate.run(settings_for(tmp_path))
    report = json.loads(open(result["report"]).read())
    assert result["incomplete_months_left_out"] == [[2020, 8]] and report["coverage_table_used"]
    n = {s["method"]: s["n"] for s in report["scores"] if s["level"] == "cell_month" and s["split"] == "all"}
    n_all = {s["method"]: s["n"] for s in report["scores_all_months"]
             if s["level"] == "cell_month" and s["split"] == "all"}
    assert n[val.FINAL] == 16 * 23 * 2 and n_all[val.FINAL] == 16 * 24 * 2


def test_calibration_and_test_years_must_not_overlap(tmp_path):
    write_counts(tmp_path)
    with pytest.raises(CalibrationError, match="must not mix"):
        validate.run(settings_for(tmp_path), years=range(2012, 2021))
