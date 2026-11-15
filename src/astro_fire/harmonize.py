"""Assemble the historical, coverage-aware calendar from counts and calibrated factors."""

from __future__ import annotations

import tempfile
from pathlib import Path

from astro_fire import calibration, storage
from astro_fire.config import Settings
from astro_fire.manifest import Manifest, new_run_id

CALENDAR_SQL = """
CREATE TEMP TABLE calendar AS
WITH raw AS (
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
    SELECT cell_l2, year, month, daynight, n_hotspots::DOUBLE, false, 'SNPP', NULL, frp_sum_mw
    FROM counts
    WHERE satellite = 'SNPP' AND (year, month) >= (2012, 2)
), dn AS (
    SELECT s.cell_l2, s.year, s.month, s.period,
           CASE WHEN NOT s.is_estimated OR c.is_complete THEN s.count_harmonized END AS count_harmonized,
           s.is_estimated, s.source_satellite,
           CASE WHEN NOT s.is_estimated OR c.is_complete OR s.raw_aqua > 0
                THEN s.frp_sum_mw_native END AS frp_sum_mw_native,
           NOT c.is_complete AS is_partial, c.days_observed::INTEGER AS days_observed,
           CASE WHEN s.is_estimated AND c.is_complete THEN s.raw_aqua ELSE r.raw_aqua END AS raw_aqua,
           r.raw_terra, r.raw_snpp, r.raw_n20
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
           sum(raw_aqua), sum(raw_terra), sum(raw_snpp), sum(raw_n20)
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
)
SELECT cell_l2, cell_l1,
       lat_min::DOUBLE AS lat_min, (lat_min + 0.25)::DOUBLE AS lat_max,
       lon_min::DOUBLE AS lon_min, (lon_min + 0.25)::DOUBLE AS lon_max,
       year::INTEGER AS year, month::INTEGER AS month, period, count_harmonized::DOUBLE AS count_harmonized,
       CASE WHEN NOT is_estimated THEN count_harmonized END::DOUBLE AS ci_low,
       CASE WHEN NOT is_estimated THEN count_harmonized END::DOUBLE AS ci_high,
       CASE WHEN NOT is_estimated THEN 0.0 END::DOUBLE AS var_harmonized,
       CASE WHEN is_estimated THEN 'VIIRS_EQUIVALENT_FROM_MODIS' ELSE 'VIIRS_OBSERVED' END AS origin,
       source_satellite, is_estimated, false AS is_nrt, is_partial, days_observed,
       raw_aqua::INTEGER AS raw_aqua, raw_terra::INTEGER AS raw_terra,
       raw_snpp::INTEGER AS raw_snpp, raw_n20::INTEGER AS raw_n20,
       frp_sum_mw_native::DOUBLE AS frp_sum_mw_native,
       median(count_harmonized) FILTER (WHERE NOT is_partial)
           OVER (PARTITION BY cell_l2, month, period)::DOUBLE AS median_hist,
       NULL::DOUBLE AS anomaly_abs, NULL::DOUBLE AS anomaly_pct, NULL::DOUBLE AS anomaly_z,
       ?::VARCHAR AS model_version
FROM bounds
"""


def run(
    settings: Settings,
    *,
    counts: str | None = None,
    factors: str | None = None,
    coverage: str | None = None,
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
        con.execute(CALENDAR_SQL, [model_version])
        rows, unique, estimates, missing, first, last = con.execute("""
            SELECT count(*), count(DISTINCT (cell_l2, year, month, period)),
                   count(*) FILTER (WHERE is_estimated), count(*) FILTER (WHERE count_harmonized IS NULL),
                   min(year), max(year) FROM calendar
        """).fetchall()[0]
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
            "estimated_intervals": "pending H11",
        }
        storage.publish_dir(settings, output.as_posix(), target)
    manifest.add_output(target, rows=rows)
    manifest.finish()
    manifest_path = manifest.save(settings)
    return {
        "status": manifest.status, "output": target, "rows": rows, "manifest": manifest_path,
        **manifest.checks,
    }
