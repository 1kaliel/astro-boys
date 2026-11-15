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


def test_harmonize_continues_with_noaa20_and_compares_an_unfinished_month_like_for_like(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("ASTRO_DATASET_VERSION", "v1")
    cell = "G081136.01"
    tables = {
        "cell_month_counts": f"""
            SELECT '{cell}' AS cell_l2, year, month, daynight, satellite, n_hotspots, frp_sum_mw
            FROM (VALUES
                (2003, 1, 'D', 'Aqua', 4, 10.0),
                (2026, 10, 'D', 'SNPP', 40, 80.0), (2026, 10, 'D', 'N20', 36, 70.0),
                (2026, 11, 'D', 'SNPP', 3, 6.0),   (2026, 11, 'D', 'N20', 20, 40.0),
                (2026, 11, 'N', 'N20', 10, 15.0)
            ) t(year, month, daynight, satellite, n_hotspots, frp_sum_mw)
        """,
        "coverage_monthly": """
            SELECT * FROM (VALUES
                ('Aqua', 2003, 1, 31, true, false), ('Terra', 2003, 1, 31, true, false),
                ('SNPP', 2026, 10, 31, true, true), ('N20', 2026, 10, 31, true, true),
                ('SNPP', 2026, 11, 2, false, true), ('N20', 2026, 11, 14, false, true)
            ) t(satellite, year, month, days_observed, is_complete, is_nrt)
        """,
        "factors": f"""
            SELECT '{cell}' AS cell_l2, month, period, 2.0 AS f, 1.0 AS b, 3.0 AS r_region,
                   8.0 AS b_witness1, 0.2 AS b_witness0, 'fixture-model' AS model_version
            FROM range(1, 13) x(month), (VALUES ('D'), ('N')) y(period)
        """,
        "continuity": "SELECT 11 AS month, 'D' AS period, 1.5 AS ratio",   # night has no ratio: 1.0
        # Three years of history (n_years = 3); 2025 has no row, so it counts as zero.
        "month_to_date": f"""
            SELECT '{cell}' AS cell_l2, year, 11 AS month, period, 14 AS days, n AS n_hotspots, 3 AS n_years
            FROM (VALUES (2023, 'D', 10), (2024, 'D', 50), (2024, 'N', 6)) t(year, period, n)
        """,
    }
    with duckdb.connect() as con:
        for dataset, query in tables.items():
            directory = tmp_path / "processed" / dataset / "v1"
            directory.mkdir(parents=True)
            con.sql(query).write_parquet(str(directory / "part-0.parquet"))
        assert cli.main(["--data-root", str(tmp_path), "harmonize"]) == 0
        calendar = str(tmp_path / "processed/calendar/v1/**/*.parquet")
        con.read_parquet(calendar, hive_partitioning=True).create_view("calendar")
        rows = con.sql("""
            SELECT month, period, source_satellite, count_harmonized, is_partial, days_observed, is_nrt,
                   median_hist, anomaly_abs, raw_snpp, raw_n20
            FROM calendar WHERE year = 2026 ORDER BY month, period
        """).fetchall()
    assert rows == [
        # October: S-NPP is complete, so it is the source. One year of history: the median is the value.
        (10, "ALL", "SNPP", 40.0, False, 31, True, 40.0, 0.0, 40, 36),
        (10, "D", "SNPP", 40.0, False, 31, True, 40.0, 0.0, 40, 36),
        # November: S-NPP stopped, NOAA-20 x continuity (1.5 by day, 1.0 by night), 14 days so far.
        # Compared with days 1-14 of 2023, 2024, 2025: day 10, 50, 0 -> 10; all 10, 56, 0 -> 10.
        (11, "ALL", "N20", 40.0, True, 14, True, 10.0, 30.0, 3, 30),
        (11, "D", "N20", 30.0, True, 14, True, 10.0, 20.0, 3, 20),
        (11, "N", "N20", 10.0, True, 14, True, 0.0, 10.0, None, 10),
    ]
