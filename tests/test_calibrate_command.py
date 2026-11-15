"""`astro-fire calibrate` end to end on synthetic monthly counts (not real data)."""

from __future__ import annotations

import json

import duckdb
import pytest

from astro_fire import calibrate, cli
from astro_fire.config import get_settings


def write_counts(root, *, extra_sql: str = "", where: str = "true") -> str:
    """Synthetic table shaped like processed/cell_month_counts/v1, partitioned by year, zeros left out."""
    out = root / "processed" / "cell_month_counts" / "v1"
    out.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(
        f"""
        CREATE TABLE counts AS
        WITH base AS (
            SELECT 'G080134.' || lpad((c + 1)::VARCHAR, 2, '0') AS cell_l2,
                   y AS year, m AS month, p AS daynight,
                   (hash(c, y, m, p) % 1000) / 1000.0 AS u, 1 + (c % 4) AS strength
            FROM range(16) tc(c), range(2012, 2022) ty(y), range(1, 13) tm(m), (VALUES ('D'), ('N')) tp(p)
        ),
        sat AS (
            SELECT cell_l2, year, month, daynight, 'Aqua' AS satellite, floor(u * strength * 3)::BIGINT AS n
            FROM base
            UNION ALL
            SELECT cell_l2, year, month, daynight, 'SNPP', floor(u * strength * 12 + u * 2)::BIGINT FROM base
            UNION ALL
            SELECT cell_l2, year, month, daynight, 'Terra', floor(u * strength * 2)::BIGINT FROM base
        )
        SELECT cell_l2, year, month, daynight, satellite, n AS n_hotspots, n AS n_active_days,
               n * 10.0 AS frp_sum_mw, n AS n_all_confidence
        FROM sat WHERE n > 0 AND NOT (satellite = 'SNPP' AND year = 2012 AND month = 1) AND ({where})
        {extra_sql}
        """
    )
    con.execute(f"COPY counts TO '{out}' (FORMAT parquet, PARTITION_BY (year), COMPRESSION zstd)")
    return str(out)


def settings_for(root):
    return get_settings(astro_data_root=str(root), astro_dataset_version="v1")


def test_calibrate_writes_factors_report_and_manifest(tmp_path):
    write_counts(tmp_path)
    result = calibrate.run(settings_for(tmp_path))

    assert result["status"] == "ok"
    assert result["calibration_years"] == list(range(2012, 2020))
    assert result["excluded_months"] == [[2012, 1]] and result["data_gaps"] == 0
    assert result["k"] in calibrate.cal.WEIGHT_GRID and result["m"] in calibrate.cal.WEIGHT_GRID
    assert result["cells"] == 16 and result["panel_rows"] == 16 * (8 * 12 - 1) * 2

    con = duckdb.connect()
    factors = f"read_parquet('{tmp_path}/processed/factors/v1/part-0.parquet')"
    assert [c[0] for c in con.execute(f"DESCRIBE SELECT * FROM {factors}").fetchall()] == list(
        calibrate.FACTOR_COLUMNS
    )
    rows, nulls, years, version = con.execute(
        f"SELECT count(*), count(*) FILTER (WHERE f IS NULL OR b IS NULL), any_value(calibration_years), "
        f"any_value(model_version) FROM {factors}"
    ).fetchone()
    assert (rows, nulls) == (16 * 12 * 2, 0)
    assert years == "2012,2013,2014,2015,2016,2017,2018,2019" and version == calibrate.MODEL_VERSION

    report = json.loads(open(result["report"]).read())
    assert report["test_years_untouched"] == [2020, 2021]
    assert len(report["leave_one_year_out"]) == 6 and len(report["region_by_month_period"]) == 24
    assert 3 < report["panel"]["overall_ratio"] < 6
    manifest = json.loads(open(result["manifest"]).read())
    assert manifest["pipeline"] == "calibrate" and manifest["status"] == "ok"
    assert manifest["inputs"][0]["rows"] > 0 and len(manifest["outputs"]) == 2


def test_fixed_weights_are_used_as_given(tmp_path):
    write_counts(tmp_path)
    result = calibrate.run(settings_for(tmp_path), k=20, m=2)
    assert (result["k"], result["m"]) == (20, 2)
    assert result["weights_chosen_by"] == "fixed on the command line"


def test_test_years_are_refused(tmp_path):
    write_counts(tmp_path)
    with pytest.raises(calibrate.CalibrationError, match="test years"):
        calibrate.run(settings_for(tmp_path), years=range(2014, 2021))


def test_missing_satellite_year_is_an_error(tmp_path):
    write_counts(tmp_path, where="NOT (satellite = 'SNPP' AND year = 2015)")
    with pytest.raises(calibrate.CalibrationError, match=r"no SNPP rows for \[2015\]"):
        calibrate.run(settings_for(tmp_path))


def test_empty_month_is_a_gap_and_left_out(tmp_path):
    write_counts(tmp_path, where="NOT (satellite = 'Aqua' AND year = 2016 AND month = 3)")
    result = calibrate.run(settings_for(tmp_path))
    assert result["excluded_months"] == [[2012, 1], [2016, 3]] and result["data_gaps"] == 1
    assert result["panel_rows"] == 16 * (8 * 12 - 2) * 2


def test_duplicate_keys_are_an_error(tmp_path):
    again = ("UNION ALL (SELECT cell_l2, year, month, daynight, satellite, n, n, n * 10.0, n FROM sat "
             "WHERE n > 0 AND satellite = 'Aqua' AND year = 2013 LIMIT 1)")
    write_counts(tmp_path, extra_sql=again)
    with pytest.raises(calibrate.CalibrationError, match="more than one row"):
        calibrate.run(settings_for(tmp_path))


def test_missing_input_gives_a_clear_cli_error(tmp_path, capsys):
    assert cli.main(["--data-root", str(tmp_path), "calibrate"]) == 1
    assert "no cell_month_counts Parquet found" in capsys.readouterr().err


def test_cli_runs_with_an_explicit_counts_folder(tmp_path, capsys):
    counts = write_counts(tmp_path / "elsewhere")
    args = ["--data-root", str(tmp_path), "calibrate", "--counts", counts, "--years", "2013-2016"]
    assert cli.main(args) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["calibration_years"] == [2013, 2014, 2015, 2016] and out["excluded_months"] == []


def test_parse_years():
    assert calibrate.parse_years("2012-2014,2016") == (2012, 2013, 2014, 2016)
    with pytest.raises(calibrate.CalibrationError):
        calibrate.parse_years("twenty")
