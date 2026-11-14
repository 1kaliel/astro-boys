"""Generate a synthetic calendar v1 sample for dashboard integration."""

import argparse
from pathlib import Path

import duckdb

QUERY = """
WITH rows AS (
    SELECT
        cell_l2, 'G081136' AS cell_l1,
        -9.0::DOUBLE AS lat_min, -8.75::DOUBLE AS lat_max,
        lon_min::DOUBLE AS lon_min, (lon_min + 0.25)::DOUBLE AS lon_max,
        year::INTEGER AS year, month::INTEGER AS month, period,
        year > 2012 OR (year = 2012 AND month >= 2) AS observed,
        6 + 2 * month + year % 5 + offset_count AS base_count,
        weight,
        day(last_day(make_date(year, month, 1)))::INTEGER AS days_observed
    FROM (VALUES ('G081136.01', -44.0, 0), ('G081136.02', -43.75, 4))
        AS cells(cell_l2, lon_min, offset_count)
    CROSS JOIN range(2003, 2026) AS years(year)
    CROSS JOIN range(1, 13) AS months(month)
    CROSS JOIN (VALUES ('D', 2), ('N', 1), ('ALL', 3)) AS periods(period, weight)
), stats AS (
    SELECT *, base_count * weight AS mock_count,
        median(base_count * weight) OVER seasonal AS median_hist,
        mad(base_count * weight) OVER seasonal AS mad_hist
    FROM rows
    WINDOW seasonal AS (PARTITION BY cell_l2, month, period)
)
SELECT
    cell_l2, cell_l1, lat_min, lat_max, lon_min, lon_max, year, month, period,
    mock_count::DOUBLE AS count_harmonized,
    (mock_count - CASE WHEN observed THEN 0 ELSE 2 * weight END)::DOUBLE AS ci_low,
    (mock_count + CASE WHEN observed THEN 0 ELSE 2 * weight END)::DOUBLE AS ci_high,
    CASE WHEN observed THEN 0.0 ELSE weight * weight END::DOUBLE AS var_harmonized,
    CASE WHEN observed THEN 'VIIRS_OBSERVED' ELSE 'VIIRS_EQUIVALENT_FROM_MODIS' END AS origin,
    CASE WHEN observed THEN 'SNPP' ELSE 'Aqua' END AS source_satellite,
    NOT observed AS is_estimated, false AS is_nrt, false AS is_partial, days_observed,
    (base_count // 2 * weight)::INTEGER AS raw_aqua,
    (base_count // 3 * weight)::INTEGER AS raw_terra,
    CASE WHEN observed THEN mock_count END::INTEGER AS raw_snpp,
    CASE WHEN year >= 2018 THEN mock_count + weight END::INTEGER AS raw_n20,
    (0.5 * mock_count)::DOUBLE AS frp_sum_mw_native,
    median_hist::DOUBLE AS median_hist,
    (mock_count - median_hist)::DOUBLE AS anomaly_abs,
    (100.0 * (mock_count - median_hist) / nullif(median_hist, 0))::DOUBLE AS anomaly_pct,
    (0.6745 * (mock_count - median_hist) / nullif(mad_hist, 0))::DOUBLE AS anomaly_z,
    'mock-v1' AS model_version
FROM stats
ORDER BY cell_l2, year, month, period
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=Path("data/interim/calendar-mock/calendar.parquet")
    )
    output = parser.parse_args().output
    output.parent.mkdir(parents=True, exist_ok=True)
    with duckdb.connect() as connection:
        connection.sql(QUERY).write_parquet(str(output), compression="zstd")
    print(output)


if __name__ == "__main__":
    main()
