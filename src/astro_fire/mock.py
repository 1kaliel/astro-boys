"""Mock `calendar` table for dashboard development. SYNTHETIC NUMBERS, NOT DATA.

Writes a table with exactly the columns of `processed/calendar/v1` (docs/data-dictionary.md) so the app can
be built before the real pipeline runs. Values are made up from a seeded formula: a seasonal curve, a cell
intensity and year-to-year noise. Nothing here comes from FIRMS and nothing here may appear in a figure,
the demo or the submission. Every row carries `model_version = 'MOCK'`, and the output folder is
`processed/calendar/mock/`, never a versioned folder.
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from astro_fire import storage
from astro_fire.config import Settings
from astro_fire.manifest import Manifest, new_run_id

MODEL_VERSION = "MOCK"
# west, south, east, north: a 3° × 3° block inside the pilot extent
DEFAULT_BBOX = (-47.0, -11.0, -44.0, -8.0)
FIRST_YEAR, LAST_YEAR = 2003, 2026
LAST_MONTH = (2026, 11)   # the event month, partial
PARTIAL_DAYS = 14
FIRST_OBSERVED = (2012, 2)  # S-NPP observed series starts here
LAST_SNPP = (2026, 10)      # S-NPP ended on 2026-11-02

# Columns of processed/calendar/v1, in contract order.
COLUMNS = (
    "cell_l2", "cell_l1", "lat_min", "lat_max", "lon_min", "lon_max", "year", "month", "period",
    "count_harmonized", "ci_low", "ci_high", "var_harmonized", "origin", "source_satellite",
    "is_estimated", "is_nrt", "is_partial", "days_observed",
    "raw_aqua", "raw_terra", "raw_snpp", "raw_n20", "frp_sum_mw_native",
    "median_hist", "anomaly_abs", "anomaly_pct", "anomaly_z", "model_version",
)


def _ym(pair: tuple[int, int]) -> int:
    return pair[0] * 12 + pair[1]


def build(con, bbox: tuple[float, float, float, float] = DEFAULT_BBOX, name: str = "mock_calendar") -> str:
    """Create the temp table `name` with the mock rows for the L2 cells whose origin lies inside `bbox`."""
    west, south, east, north = bbox
    if not (west < east and south < north):
        raise ValueError("bbox must be west,south,east,north with west < east and south < north")
    obs, snpp_end, last = _ym(FIRST_OBSERVED), _ym(LAST_SNPP), _ym(LAST_MONTH)
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH cells AS (  -- L2 cells (0.25°), IDs as in docs/spec/harmonization.md section 4
            SELECT lat_min, lat_min + 0.25 AS lat_max, lon_min, lon_min + 0.25 AS lon_max,
                   'G' || lpad(floor(lat_min + 90)::INT::VARCHAR, 3, '0')
                       || lpad(floor(lon_min + 180)::INT::VARCHAR, 3, '0') AS cell_l1,
                   (floor((lat_min + 90 - floor(lat_min + 90)) * 4)::INT * 4
                    + floor((lon_min + 180 - floor(lon_min + 180)) * 4)::INT + 1) AS k
            FROM (SELECT floor({south} * 4) / 4 + i * 0.25 AS lat_min
                  FROM range(ceil(({north} - {south}) * 4)::INT) t(i))
            CROSS JOIN (SELECT floor({west} * 4) / 4 + j * 0.25 AS lon_min
                        FROM range(ceil(({east} - {west}) * 4)::INT) t(j))
        ),
        grid AS (
            SELECT cell_l1 || '.' || lpad(k::VARCHAR, 2, '0') AS cell_l2, c.* EXCLUDE (k),
                   y::INT AS year, m::INT AS month, p AS period, y * 12 + m AS ym
            FROM cells c, range({FIRST_YEAR}, {LAST_YEAR + 1}) ty(y), range(1, 13) tm(m),
                 (VALUES ('D'), ('N')) tp(p)
            WHERE y * 12 + m <= {last}
        ),
        truth AS (  -- made-up "VIIRS-scale" activity: dry-season peak in September, fewer hotspots at night
            SELECT *,
                   (hash(cell_l2) % 1000) / 1000.0                    AS u_cell,
                   (hash(year, 'y') % 1000) / 1000.0                  AS u_year,
                   (hash(cell_l2, year, month, period) % 1000) / 1000.0 AS u_row,
                   ym >= {obs} AS observed, ym = {last} AS is_partial
            FROM grid
        ),
        vals AS (
            SELECT *,
                   round((2 + 60 * u_cell * u_cell)
                         * exp(-pow((month - 9) / 1.6, 2))
                         * (0.6 + 0.8 * u_year) * (0.5 + u_row)
                         * CASE WHEN period = 'N' THEN 0.35 ELSE 1 END
                         * CASE WHEN is_partial THEN {PARTIAL_DAYS} / 30.0 ELSE 1 END
                         + 0.6 * u_row)::BIGINT AS v
            FROM truth
        ),
        dn AS (
            SELECT cell_l2, cell_l1, lat_min, lat_max, lon_min, lon_max, year, month, period, ym,
                   observed, is_partial, v,
                   round(v / 4.0)::BIGINT AS aqua, round(v / 5.5)::BIGINT AS terra,
                   CASE WHEN observed THEN v::DOUBLE
                        WHEN round(v / 4.0) > 0 THEN round(v / 4.0) * 4.2
                        ELSE 0.8 END AS count_harmonized
            FROM vals
        ),
        dn2 AS (
            SELECT *,
                   CASE WHEN observed THEN 0 ELSE pow(0.18 * count_harmonized + 0.5, 2) END AS var_harmonized
            FROM dn
        ),
        allp AS (  -- ALL = D + N; variances add
            SELECT * FROM dn2
            UNION ALL
            SELECT cell_l2, cell_l1, lat_min, lat_max, lon_min, lon_max, year, month, 'ALL', ym,
                   any_value(observed), any_value(is_partial), sum(v), sum(aqua), sum(terra),
                   sum(count_harmonized), sum(var_harmonized)
            FROM dn2 GROUP BY ALL
        ),
        stats AS (  -- baseline: all complete years
            SELECT cell_l2, month, period, median(count_harmonized) AS median_hist
            FROM allp WHERE NOT is_partial GROUP BY ALL
        ),
        mad AS (
            SELECT a.cell_l2, a.month, a.period, median(abs(a.count_harmonized - s.median_hist)) AS mad
            FROM allp a JOIN stats s USING (cell_l2, month, period) WHERE NOT a.is_partial GROUP BY ALL
        )
        SELECT a.cell_l2, a.cell_l1, a.lat_min, a.lat_max, a.lon_min, a.lon_max, a.year, a.month, a.period,
               a.count_harmonized,
               CASE WHEN a.observed THEN a.count_harmonized
                    ELSE greatest(0, a.count_harmonized - 1.645 * sqrt(a.var_harmonized)) END AS ci_low,
               CASE WHEN a.observed THEN a.count_harmonized
                    ELSE a.count_harmonized + 1.645 * sqrt(a.var_harmonized) END AS ci_high,
               a.var_harmonized::DOUBLE AS var_harmonized,
               CASE WHEN a.observed THEN 'VIIRS_OBSERVED' ELSE 'VIIRS_EQUIVALENT_FROM_MODIS' END AS origin,
               CASE WHEN NOT a.observed THEN 'Aqua' WHEN a.ym <= {snpp_end} THEN 'SNPP' ELSE 'N20' END
                   AS source_satellite,
               NOT a.observed AS is_estimated,
               a.ym >= {_ym((2026, 8))} AS is_nrt,
               a.is_partial,
               CASE WHEN a.is_partial THEN {PARTIAL_DAYS}
                    ELSE day(last_day(make_date(a.year, a.month, 1))) END::INT AS days_observed,
               a.aqua::INT AS raw_aqua,
               a.terra::INT AS raw_terra,
               CASE WHEN a.observed AND a.ym <= {snpp_end} THEN a.v END::INT AS raw_snpp,
               CASE WHEN a.year >= 2018 THEN round(a.v * 0.97) END::INT AS raw_n20,
               round(a.v * 11.5, 1)::DOUBLE AS frp_sum_mw_native,
               s.median_hist,
               a.count_harmonized - s.median_hist AS anomaly_abs,
               CASE WHEN s.median_hist > 0
                    THEN round(100 * (a.count_harmonized - s.median_hist) / s.median_hist, 1)
                    END AS anomaly_pct,
               CASE WHEN m.mad > 0
                    THEN round((a.count_harmonized - s.median_hist) / (1.4826 * m.mad), 2) END AS anomaly_z,
               '{MODEL_VERSION}' AS model_version
        FROM allp a
        JOIN stats s USING (cell_l2, month, period)
        JOIN mad m USING (cell_l2, month, period)
        -- as in the real table, an observed month with no detection has no row
        WHERE NOT (a.observed AND a.count_harmonized = 0)
        ORDER BY a.year, a.cell_l2, a.month, a.period
        """
    )
    return name


def run(settings: Settings, bbox: tuple[float, float, float, float] = DEFAULT_BBOX) -> dict:
    """Write the mock to `processed/calendar/mock/` (partitioned by year) and a manifest."""
    run_id = new_run_id("mock-calendar")
    manifest = Manifest(run_id=run_id, pipeline="mock-calendar", settings=settings.redacted())
    con = storage.connect(settings)
    build(con, bbox)
    rows, cells = con.execute("SELECT count(*), count(DISTINCT cell_l2) FROM mock_calendar").fetchone()

    target = storage.uri(settings, "processed", "calendar", "mock")
    staging = Path(tempfile.mkdtemp(prefix="astro_mock_"))
    try:
        out = staging / "calendar"
        con.execute(f"COPY mock_calendar TO '{out}' (FORMAT parquet, PARTITION_BY (year), COMPRESSION zstd)")
        if settings.is_remote:
            storage.upload_dir(str(out), target)
        else:
            shutil.rmtree(target, ignore_errors=True)
            shutil.copytree(out, target)
        manifest.add_output(target, rows=rows)
        manifest.checks = {"synthetic": True, "rows": rows, "cells": cells, "bbox_w_s_e_n": list(bbox),
                           "model_version": MODEL_VERSION}
        manifest.finish("ok" if rows > 0 else "failed")
        manifest_dir = storage.uri(settings, "manifests")
        if settings.is_remote:
            local_dir = tempfile.mkdtemp(prefix="astro_manifest_")
            name = Path(manifest.write(local_dir)).name
            storage.upload_dir(local_dir, manifest_dir)
            manifest_path = f"{manifest_dir}/{name}"
        else:
            manifest_path = manifest.write(manifest_dir)
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    return {"status": manifest.status, "output": target, "manifest": manifest_path, **manifest.checks}
