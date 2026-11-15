import duckdb

from astro_fire import cli, mock


def test_harmonize_uses_coverage_and_existing_terra_aware_factors(tmp_path, monkeypatch):
    monkeypatch.setenv("ASTRO_DATASET_VERSION", "v1")
    tables = {
        "cell_month_counts": """
            SELECT 'G081136.01' AS cell_l2, year, month, daynight, satellite, n_hotspots, frp_sum_mw
            FROM (VALUES
                (2003, 1, 'D', 'Aqua', 4, 10.0),
                (2003, 1, 'N', 'Terra', 7, 12.0),
                (2003, 2, 'D', 'Aqua', 1, 2.0),
                (2003, 3, 'N', 'Terra', 3, 5.0),
                (2012, 2, 'D', 'SNPP', 11, 22.0),
                (2012, 2, 'N', 'SNPP', 5, 8.0),
                (2012, 2, 'D', 'Aqua', 99, 100.0)
            ) t(year, month, daynight, satellite, n_hotspots, frp_sum_mw)
        """,
        "coverage_monthly": """
            SELECT * FROM (VALUES
                ('Aqua', 2003, 1, 31, true), ('Terra', 2003, 1, 20, false),
                ('Aqua', 2003, 2, 17, false), ('Aqua', 2003, 3, 31, true),
                ('Terra', 2003, 3, 31, true), ('SNPP', 2012, 2, 24, false)
            ) t(satellite, year, month, days_observed, is_complete)
        """,
        "factors": """
            SELECT 'G081136.01' AS cell_l2, month, period, 2.0 AS f, 1.0 AS b, 3.0 AS r_region,
                   8.0 AS b_witness1, 0.2 AS b_witness0, 'fixture-model' AS model_version
            FROM range(1, 4) x(month), (VALUES ('D'), ('N')) y(period)
        """,
    }
    with duckdb.connect() as con:
        for dataset, query in tables.items():
            directory = tmp_path / "processed" / dataset / "v1"
            directory.mkdir(parents=True)
            con.sql(query).write_parquet(str(directory / "part-0.parquet"))
        assert cli.main(["--data-root", str(tmp_path), "harmonize"]) == 0
        calendar = tmp_path / "processed/calendar/v1/**/*.parquet"
        con.read_parquet(str(calendar), hive_partitioning=True).create_view("calendar")
        assert set(con.table("calendar").columns) == set(mock.COLUMNS)
        assert con.sql("""
            SELECT year, month, period, count_harmonized, is_partial, days_observed,
                   raw_aqua, raw_terra, raw_snpp, ci_low, ci_high, var_harmonized
            FROM calendar
            WHERE period = 'ALL' OR (year = 2003 AND month = 3 AND period = 'N')
            ORDER BY year, month, period
        """).fetchall() == [
            (2003, 1, "ALL", 9.0, False, 31, 4, 7, None, None, None, None),
            (2003, 2, "ALL", None, True, 17, 1, None, None, None, None, None),
            (2003, 3, "ALL", 8.2, False, 31, 0, 3, None, None, None, None),
            (2003, 3, "N", 8.0, False, 31, 0, 3, None, None, None, None),
            (2012, 2, "ALL", 16.0, True, 24, 99, None, 16, 16.0, 16.0, 0.0),
        ]
