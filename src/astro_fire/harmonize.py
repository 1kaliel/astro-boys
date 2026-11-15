"""Assemble the historical, coverage-aware calendar from counts and calibrated factors."""

from __future__ import annotations

import tempfile
from pathlib import Path

import duckdb

from astro_fire import calibration, storage, uncertainty
from astro_fire.config import Settings
from astro_fire.manifest import Manifest, new_run_id

CALENDAR_SQL = """
CREATE TEMP TABLE calendar AS
WITH observed_source AS (
    -- From February 2012 the series is observed VIIRS: S-NPP while its month is complete, otherwise the
    -- VIIRS satellite with more days observed (NOAA-20 from November 2026, and in S-NPP outage months),
    -- scaled to the S-NPP record by the continuity ratio.
    SELECT year, month,
           CASE WHEN coalesce(s.is_complete, false) THEN 'SNPP'
                WHEN coalesce(n.days_observed, 0) > coalesce(s.days_observed, 0) THEN 'N20'
                ELSE 'SNPP' END AS satellite
    FROM (SELECT * FROM monthly_coverage WHERE satellite = 'SNPP') s
    FULL JOIN (SELECT * FROM monthly_coverage WHERE satellite = 'N20') n USING (year, month)
    WHERE (year, month) >= (2012, 2)
), raw AS (
    SELECT cell_l2, year, month, daynight AS period,
           max(n_hotspots) FILTER (WHERE satellite = 'Aqua') AS raw_aqua,
           max(n_hotspots) FILTER (WHERE satellite = 'Terra') AS raw_terra,
           max(n_hotspots) FILTER (WHERE satellite = 'SNPP') AS raw_snpp,
           max(n_hotspots) FILTER (WHERE satellite = 'N20') AS raw_n20
    FROM counts GROUP BY ALL
), series AS (
    SELECT e.cell_l2, e.year, e.month, e.period, e.estimate AS count_harmonized, true AS is_estimated,
           'Aqua' AS source_satellite, e.raw_aqua,
           coalesce(a.frp_sum_mw, CASE WHEN e.raw_aqua = 0 THEN 0.0 END) AS frp_sum_mw_native
    FROM estimates e LEFT JOIN counts a
      ON a.cell_l2 = e.cell_l2 AND a.year = e.year AND a.month = e.month
      AND a.daynight = e.period AND a.satellite = 'Aqua'
    UNION ALL
    SELECT c.cell_l2, c.year, c.month, c.daynight,
           c.n_hotspots * CASE WHEN o.satellite = 'N20' THEN coalesce(k.ratio, 1.0) ELSE 1.0 END,
           false, o.satellite, NULL, c.frp_sum_mw
    FROM counts c
    JOIN observed_source o ON o.year = c.year AND o.month = c.month AND o.satellite = c.satellite
    LEFT JOIN continuity k ON k.month = c.month AND k.period = c.daynight
), dn AS (
    SELECT s.cell_l2, s.year, s.month, s.period,
           CASE WHEN NOT s.is_estimated OR c.is_complete THEN s.count_harmonized END AS count_harmonized,
           s.is_estimated, s.source_satellite,
           CASE WHEN NOT s.is_estimated OR c.is_complete OR s.raw_aqua > 0
                THEN s.frp_sum_mw_native END AS frp_sum_mw_native,
           NOT c.is_complete AS is_partial, c.days_observed::INTEGER AS days_observed,
           CASE WHEN s.is_estimated AND c.is_complete THEN s.raw_aqua ELSE r.raw_aqua END AS raw_aqua,
           r.raw_terra, r.raw_snpp, r.raw_n20, {is_nrt} AS is_nrt
    FROM series s
    LEFT JOIN raw r USING (cell_l2, year, month, period)
    JOIN monthly_coverage c ON c.satellite = s.source_satellite AND c.year = s.year AND c.month = s.month
    WHERE c.days_observed > 0
), periods AS (
    SELECT * FROM dn
    UNION ALL
    SELECT cell_l2, year, month, 'ALL',
           CASE WHEN count(count_harmonized) = count(*) THEN sum(count_harmonized) END,
           is_estimated, source_satellite, sum(frp_sum_mw_native), is_partial, days_observed,
           sum(raw_aqua), sum(raw_terra), sum(raw_snpp), sum(raw_n20), is_nrt
    FROM dn GROUP BY ALL
), cells AS (
    SELECT *, split_part(cell_l2, '.', 1) AS cell_l1,
           split_part(cell_l2, '.', 2)::INTEGER - 1 AS child
    FROM periods
), bounds AS (
    SELECT *,
           substring(cell_l1, 2, 3)::INTEGER - 90 + (child // 4) * 0.25 AS lat_min,
           substring(cell_l1, 5, 3)::INTEGER - 180 + (child % 4) * 0.25 AS lon_min
    FROM cells
), slots AS (  -- years in which each month was fully observed: the length of every cell's history
    SELECT month, count(DISTINCT year) AS n_years FROM bounds WHERE NOT is_partial GROUP BY month
), history AS (  -- a fully observed month with no row had no detection: it counts as 0 in the history
    SELECT b.cell_l2, b.month, b.period,
           list_resize(coalesce(list(b.count_harmonized) FILTER (
               WHERE NOT b.is_partial AND b.count_harmonized IS NOT NULL), []), any_value(s.n_years), 0.0)
               AS counts
    FROM bounds b JOIN slots s USING (month) GROUP BY ALL
), baseline AS (
    SELECT cell_l2, month, period, list_median(counts) AS median_hist,
           list_median(list_transform(counts, lambda x: abs(x - list_median(counts)))) AS mad
    FROM history
), window_meta AS (  -- the unfinished month, if any: compared with the same days of earlier years
    SELECT any_value(month) AS month, any_value(days) AS days, max(year) AS last_year,
           any_value(n_years) AS n_years
    FROM month_to_date
), window_years AS (
    SELECT cell_l2, year, period, n_hotspots::DOUBLE AS n FROM month_to_date
    UNION ALL
    SELECT cell_l2, year, 'ALL', sum(n_hotspots)::DOUBLE FROM month_to_date GROUP BY ALL
), window_history AS (
    SELECT w.cell_l2, w.period, list_resize(list(w.n), any_value(m.n_years), 0.0) AS counts
    FROM window_years w, window_meta m GROUP BY ALL
), window_baseline AS (
    SELECT cell_l2, period, list_median(counts) AS median_hist,
           list_median(list_transform(counts, lambda x: abs(x - list_median(counts)))) AS mad
    FROM window_history
), joined AS (
    SELECT b.*, u.q05_ratio, u.q95_ratio, u.variance_ratio,
           coalesce(b.is_partial AND NOT b.is_estimated AND b.month = m.month
                    AND b.days_observed = m.days AND b.year > m.last_year, false) AS same_window,
           h.median_hist AS month_median, h.mad AS month_mad,
           coalesce(t.median_hist, 0.0) AS window_median, coalesce(t.mad, 0.0) AS window_mad
    FROM bounds b
    LEFT JOIN window_meta m ON true
    LEFT JOIN baseline h ON h.cell_l2 = b.cell_l2 AND h.month = b.month AND h.period = b.period
    LEFT JOIN window_baseline t ON t.cell_l2 = b.cell_l2 AND t.period = b.period
    LEFT JOIN uncertainty u
      ON b.is_estimated AND b.count_harmonized > 0 AND u.period = b.period
     AND u.regime = CASE WHEN b.raw_aqua > 0 THEN 'aqua_positive' ELSE 'aqua_zero' END
     AND u.bin = greatest({bin_min}, least({bin_max}, floor(log2(b.count_harmonized))))::INT
), final AS (
    SELECT b.* EXCLUDE (q05_ratio, q95_ratio, variance_ratio, same_window, month_median, month_mad,
                        window_median, window_mad),
           b.q05_ratio, b.q95_ratio, b.variance_ratio,
           CASE WHEN same_window THEN window_median ELSE month_median END AS median_hist,
           CASE WHEN same_window THEN window_mad ELSE month_mad END AS mad,
           same_window
    FROM joined b
), scored AS (
    SELECT f.*,
           CASE WHEN NOT f.is_estimated THEN f.count_harmonized
                WHEN f.q05_ratio IS NOT NULL
                THEN least(f.count_harmonized * f.q05_ratio, f.count_harmonized) END AS ci_low,
           CASE WHEN NOT f.is_estimated THEN f.count_harmonized
                WHEN f.q95_ratio IS NOT NULL
                THEN greatest(f.count_harmonized * f.q95_ratio, f.count_harmonized) END AS ci_high,
           CASE WHEN NOT f.is_estimated THEN 0.0
                ELSE f.count_harmonized * f.variance_ratio END AS var_harmonized,
           -- a partial month has an anomaly only against the same days of earlier years
           CASE WHEN NOT f.is_partial OR f.same_window THEN f.count_harmonized - f.median_hist END
               AS anomaly_abs
    FROM final f
)
SELECT cell_l2, cell_l1,
       lat_min::DOUBLE AS lat_min, (lat_min + 0.25)::DOUBLE AS lat_max,
       lon_min::DOUBLE AS lon_min, (lon_min + 0.25)::DOUBLE AS lon_max,
       year::INTEGER AS year, month::INTEGER AS month, period, count_harmonized::DOUBLE AS count_harmonized,
       ci_low::DOUBLE AS ci_low, ci_high::DOUBLE AS ci_high, var_harmonized::DOUBLE AS var_harmonized,
       CASE WHEN is_estimated THEN 'VIIRS_EQUIVALENT_FROM_MODIS' ELSE 'VIIRS_OBSERVED' END AS origin,
       source_satellite, is_estimated, is_nrt, is_partial, days_observed,
       raw_aqua::INTEGER AS raw_aqua, raw_terra::INTEGER AS raw_terra,
       raw_snpp::INTEGER AS raw_snpp, raw_n20::INTEGER AS raw_n20,
       frp_sum_mw_native::DOUBLE AS frp_sum_mw_native,
       median_hist::DOUBLE AS median_hist,
       anomaly_abs::DOUBLE AS anomaly_abs,
       CASE WHEN median_hist > 0 THEN 100 * anomaly_abs / median_hist END::DOUBLE AS anomaly_pct,
       CASE WHEN mad > 0 THEN anomaly_abs / (1.4826 * mad) END::DOUBLE AS anomaly_z,
       ?::VARCHAR AS model_version
FROM scored
"""


def run(
    settings: Settings,
    *,
    counts: str | None = None,
    factors: str | None = None,
    coverage: str | None = None,
    uncertainty_location: str | None = None,
) -> dict:
    version = settings.dataset_version
    inputs = {
        "counts": counts or storage.uri(settings, "processed", "cell_month_counts", version),
        "factors": factors or storage.uri(settings, "processed", "factors", version),
        "monthly_coverage": coverage or storage.uri(settings, "processed", "coverage_monthly", version),
    }
    target = storage.uri(settings, "processed", "calendar", version)
    if not settings.is_remote and Path(target).exists():
        raise FileExistsError(f"{target} already exists; use a fresh data root or dataset version")
    manifest = Manifest(new_run_id("harmonize"), "harmonize", settings.redacted())
    with storage.connect(settings) as con, tempfile.TemporaryDirectory(prefix="astro_harmonize_") as work:
        for table, location in inputs.items():
            glob = storage.parquet_glob(location)
            rows = con.read_parquet(glob, hive_partitioning=True)
            rows.create_view(table)
            if location.startswith("gs://"):
                manifest.add_input(location)
            else:
                for path in sorted(Path(location).rglob("*.parquet")):
                    manifest.add_input(path.as_posix())
        # Error table from `calibrate`: without it the estimated months keep null intervals.
        error_location = uncertainty_location or storage.uri(settings, "processed", "uncertainty", version)
        try:
            con.read_parquet(storage.parquet_glob(error_location)).create_view("uncertainty")
            manifest.inputs.append({"path": error_location, "sha256": None, "rows": None})
            has_intervals = True
        except (duckdb.Error, OSError):
            con.execute("CREATE TEMP TABLE uncertainty (regime VARCHAR, period VARCHAR, bin INT, "
                        "variance_ratio DOUBLE, q05_ratio DOUBLE, q95_ratio DOUBLE)")
            has_intervals = False
        model_versions = con.execute("SELECT DISTINCT model_version FROM factors").fetchall()
        if len(model_versions) != 1 or not model_versions[0][0]:
            raise ValueError("expected exactly one nonempty calibration model version")
        model_version = model_versions[0][0]
        months = con.execute("""
            SELECT year, month FROM monthly_coverage
            WHERE satellite = 'Aqua' AND year >= 2003 AND (year, month) <= (2012, 1)
              AND year IN (SELECT year FROM counts WHERE satellite = 'Aqua')
        """).fetchall()
        terra_complete = set(con.execute("""
            SELECT year, month FROM monthly_coverage WHERE satellite = 'Terra' AND is_complete
        """).fetchall())
        calibration.build_source(
            con, "counts", "factors", months,
            witness_gap_months=sorted(set(months) - terra_complete),
        )
        calibration.apply_factors(con, "source", "factors")
        coverage_columns = {r[0] for r in con.execute("DESCRIBE monthly_coverage").fetchall()}
        optional = {
            # S-NPP / NOAA-20 ratio by month and period, from `calibrate`; 1.0 where it is missing.
            "continuity": "month INT, period VARCHAR, ratio DOUBLE",
            # Same-days history for the unfinished month, from `coverage`.
            "month_to_date": "cell_l2 VARCHAR, year INT, month INT, period VARCHAR, days INT, "
                             "n_hotspots BIGINT, n_years INT",
        }
        used_optional = []
        for table, schema in optional.items():
            location = storage.uri(settings, "processed", table, version)
            try:
                con.read_parquet(storage.parquet_glob(location)).create_view(table)
                manifest.inputs.append({"path": location, "sha256": None, "rows": None})
                used_optional.append(table)
            except (duckdb.Error, OSError):
                con.execute(f"CREATE TEMP TABLE {table} ({schema})")
        sql = CALENDAR_SQL.format(
            bin_min=uncertainty.BIN_MIN, bin_max=uncertainty.BIN_MAX,
            is_nrt="coalesce(c.is_nrt, false)" if "is_nrt" in coverage_columns else "false",
        )
        con.execute(sql, [model_version])
        rows, unique, estimates, missing, first, last = con.execute("""
            SELECT count(*), count(DISTINCT (cell_l2, year, month, period)),
                   count(*) FILTER (WHERE is_estimated), count(*) FILTER (WHERE count_harmonized IS NULL),
                   min(year), max(year) FROM calendar
        """).fetchall()[0]
        no_interval = con.execute(
            "SELECT count(*) FROM calendar WHERE is_estimated AND count_harmonized IS NOT NULL "
            "AND ci_low IS NULL").fetchone()[0]
        if not 0 < estimates < rows or rows != unique:
            raise ValueError("expected unique calendar keys with both historical estimates and observations")
        output = Path(work) / "calendar"
        con.execute(
            "COPY (SELECT * FROM calendar ORDER BY cell_l2, month, period) TO ? "
            "(FORMAT PARQUET, COMPRESSION ZSTD, PARTITION_BY (year))",
            [str(output)],
        )
        manifest.checks = {
            "model_version": model_version, "historical_median_years": [first, last],
            "estimated_rows": estimates, "observed_rows": rows - estimates, "missing_count_rows": missing,
            "estimated_intervals": "from the out-of-year error table" if has_intervals else "missing",
            "estimated_rows_without_interval": no_interval,
            "optional_inputs_used": used_optional,
            "observed_source_by_month": con.execute(
                "SELECT source_satellite, count(DISTINCT (year, month)), min(year * 100 + month), "
                "max(year * 100 + month) FROM calendar WHERE NOT is_estimated GROUP BY 1 ORDER BY 1"
            ).fetchall(),
        }
        storage.publish_dir(settings, output.as_posix(), target)
    manifest.add_output(target, rows=rows)
    manifest.finish()
    manifest_path = manifest.save(settings)
    return {
        "status": manifest.status, "output": target, "rows": rows, "manifest": manifest_path,
        **manifest.checks,
    }
