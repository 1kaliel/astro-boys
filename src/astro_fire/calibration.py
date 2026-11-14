"""Transfer function Aqua → VIIRS-equivalent counts (docs/spec/harmonization.md, section 6).

Everything here works on monthly counts per grid cell, never on individual detections:

    estimate = F(cell, month, period) × Aqua     when Aqua > 0
    estimate = B(cell, month, period)            when Aqua = 0

    F = (ΣV⁺ + K·R) / (ΣA⁺ + K)        B = (ΣV⁰ + M·B_reg) / (n⁰ + M)

Input is a table shaped like `processed/cell_month_counts/v1`: one row per
`cell_l2 × year × month × daynight × satellite` with `n_hotspots`, holding only cell-months that had
detections. Functions take a DuckDB connection and table names, and create temp tables.

Zeros: inside the calibration window both satellites were operating, so a cell-month with no row is a
count of zero detections (not "no fire"). Zeros are filled only for cells of the calibration universe:
cells with at least one detection by either satellite in the calibration years. Everything else stays
absent, so no estimate is ever invented for a cell we know nothing about.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

import duckdb

SOURCE = "Aqua"
REFERENCE = "SNPP"
PERIODS = ("D", "N")
WEIGHT_GRID = (0, 2, 5, 10, 20, 50)
# S-NPP science data starts on 2012-01-20: January 2012 is a partial month for the reference.
PARTIAL_REFERENCE_MONTHS = ((2012, 1),)


def _in_list(values: Iterable[int]) -> str:
    values = sorted({int(v) for v in values})
    if not values:
        raise ValueError("at least one year is required")
    return ", ".join(str(v) for v in values)


def _f_sql(a_pos: str, v_pos: str, r: str, k: str) -> str:
    """Pooled factor. With no Aqua evidence in the cell the factor is the regional ratio."""
    return f"CASE WHEN {a_pos} = 0 THEN {r} ELSE ({v_pos} + {k} * {r}) / ({a_pos} + {k}) END"


def _b_sql(n_zero: str, v_zero: str, b_reg: str, m: str) -> str:
    """Pooled background. With no zero-Aqua month in the cell it is the regional background."""
    return f"CASE WHEN {n_zero} = 0 THEN {b_reg} ELSE ({v_zero} + {m} * {b_reg}) / ({n_zero} + {m}) END"


_KEY_SUMS = """
    coalesce(sum(a) FILTER (WHERE a > 0), 0) AS sum_aqua_pos,
    coalesce(sum(v) FILTER (WHERE a > 0), 0) AS sum_viirs_pos,
    count(*) FILTER (WHERE a = 0)            AS n_zero,
    coalesce(sum(v) FILTER (WHERE a = 0), 0) AS sum_viirs_zero
"""


def build_panel(
    con: duckdb.DuckDBPyConnection,
    counts: str,
    years: Iterable[int],
    *,
    name: str = "panel",
    source: str = SOURCE,
    reference: str = REFERENCE,
    exclude_months: Sequence[tuple[int, int]] = PARTIAL_REFERENCE_MONTHS,
) -> str:
    """Paired table: one row per universe cell × year × month × period with `a` (source) and `v` (reference).

    Only use years in which both satellites operated for the whole year, apart from `exclude_months`.
    """
    excluded = ", ".join(f"({y}, {m})" for y, m in exclude_months) or "(NULL, NULL)"
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH c AS (
            SELECT cell_l2, year::INT AS year, month::INT AS month, daynight AS period,
                   coalesce(sum(n_hotspots) FILTER (WHERE satellite = $source), 0)    AS a,
                   coalesce(sum(n_hotspots) FILTER (WHERE satellite = $reference), 0) AS v
            FROM {counts}
            WHERE year IN ({_in_list(years)}) AND satellite IN ($source, $reference)
              AND daynight IN ('D', 'N')
            GROUP BY ALL
        ),
        grid AS (
            SELECT cell_l2, y.year, m.month, p.period
            FROM (SELECT DISTINCT cell_l2 FROM c)
            CROSS JOIN (SELECT DISTINCT year FROM c) y
            CROSS JOIN (SELECT unnest(range(1, 13))::INT AS month) m
            CROSS JOIN (SELECT unnest(['D', 'N']) AS period) p
            WHERE (y.year, m.month) NOT IN ({excluded})
        )
        SELECT g.cell_l2, g.year, g.month, g.period,
               coalesce(c.a, 0)::BIGINT AS a, coalesce(c.v, 0)::BIGINT AS v
        FROM grid g LEFT JOIN c USING (cell_l2, year, month, period)
        """,
        {"source": source, "reference": reference},
    )
    return name


def fit_factors(
    con: duckdb.DuckDBPyConnection,
    panel: str,
    *,
    k: float,
    m: float,
    name: str = "factors",
    model_version: str = "dev",
) -> str:
    """Factors per `cell_l2 × month × period`, with the columns of `processed/factors/v1`.

    The pooling region is the whole panel (same month and period). `f` is null when the region has no
    Aqua detections at all for that month and period; `b` is null when it has no zero-Aqua month.
    """
    if k < 0 or m < 0:
        raise ValueError("k and m must be >= 0")
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH cell AS (
            SELECT cell_l2, month, period, {_KEY_SUMS} FROM {panel} GROUP BY ALL
        ),
        region AS (
            SELECT month, period,
                   sum(sum_viirs_pos) / nullif(sum(sum_aqua_pos), 0) AS r_region,
                   sum(sum_viirs_zero) / nullif(sum(n_zero), 0)      AS b_region
            FROM cell GROUP BY ALL
        )
        SELECT c.cell_l2, c.month, c.period,
               {_f_sql("c.sum_aqua_pos", "c.sum_viirs_pos", "r.r_region", "$k")} AS f,
               {_b_sql("c.n_zero", "c.sum_viirs_zero", "r.b_region", "$m")}      AS b,
               c.sum_aqua_pos, c.sum_viirs_pos, c.n_zero, c.sum_viirs_zero,
               r.r_region, r.b_region,
               $k::DOUBLE AS k, $m::DOUBLE AS m,
               CASE WHEN c.sum_aqua_pos = 0 THEN 0
                    ELSE c.sum_aqua_pos / (c.sum_aqua_pos + $k) END AS weight_cell,
               (SELECT string_agg(DISTINCT year::VARCHAR, ',' ORDER BY year::VARCHAR) FROM {panel})
                   AS calibration_years,
               $model_version AS model_version
        FROM cell c JOIN region r USING (month, period)
        """,
        {"k": float(k), "m": float(m), "model_version": model_version},
    )
    return name


def build_source(
    con: duckdb.DuckDBPyConnection,
    counts: str,
    factors: str,
    months: Iterable[tuple[int, int]],
    *,
    name: str = "source",
    source: str = SOURCE,
) -> str:
    """Source-satellite counts to convert: `cell_l2, year, month, period, a`.

    `months` lists the (year, month) pairs in which the source satellite was operating. Cells of the
    calibration universe get a = 0 where the satellite reported nothing; other cells appear only where
    they have detections.
    """
    pairs = sorted({(int(y), int(mo)) for y, mo in months})
    if not pairs:
        raise ValueError("at least one (year, month) is required")
    values = ", ".join(f"({y}, {mo})" for y, mo in pairs)
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH months(year, month) AS (VALUES {values}),
        obs AS (
            SELECT cell_l2, year::INT AS year, month::INT AS month, daynight AS period,
                   sum(n_hotspots)::BIGINT AS a
            FROM {counts} JOIN months USING (year, month)
            WHERE satellite = $source AND daynight IN ('D', 'N')
            GROUP BY ALL
        ),
        grid AS (
            SELECT f.cell_l2, mo.year, f.month, f.period
            FROM {factors} f JOIN months mo USING (month)
        )
        SELECT cell_l2, year, month, period, coalesce(o.a, 0)::BIGINT AS a
        FROM grid g FULL JOIN obs o USING (cell_l2, year, month, period)
        """,
        {"source": source},
    )
    return name


def apply_factors(
    con: duckdb.DuckDBPyConnection,
    source: str,
    factors: str,
    *,
    name: str = "estimates",
    use_background: bool = True,
) -> str:
    """VIIRS-equivalent estimate for every row of `source` (`cell_l2, year, month, period, a`).

    - Aqua > 0: `F × Aqua`; a cell without its own factor uses the regional ratio.
    - Aqua = 0: `B` for cells of the calibration universe; rows of other cells are dropped.
    - The estimate is null (missing, never zero) when no factor exists for that month and period.
    """
    background = "f.b" if use_background else "0"
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH region AS (
            SELECT month, period, any_value(r_region) AS r_region FROM {factors} GROUP BY ALL
        )
        SELECT s.cell_l2, s.year, s.month, s.period, s.a AS raw_aqua,
               CASE WHEN s.a > 0 THEN s.a * coalesce(f.f, r.r_region) ELSE {background} END AS estimate,
               CASE WHEN s.a = 0 THEN 'background'
                    WHEN f.f IS NOT NULL THEN 'cell_factor'
                    ELSE 'regional_factor' END AS estimate_rule
        FROM {source} s
        LEFT JOIN {factors} f USING (cell_l2, month, period)
        LEFT JOIN region r USING (month, period)
        WHERE s.a > 0 OR f.cell_l2 IS NOT NULL
        """
    )
    return name


def leave_one_year_out(
    con: duckdb.DuckDBPyConnection,
    panel: str,
    grid: Sequence[float] = WEIGHT_GRID,
) -> list[dict]:
    """Out-of-year error for each pooling weight, using calibration years only.

    Each year is predicted from factors fitted on the other years. K only affects months with Aqua > 0
    and M only months with Aqua = 0, so the two are scored separately:
    `mae_pos` is the error of `F × Aqua`, `mae_zero` the error of `B`.
    """
    weights = ", ".join(f"({float(w)}::DOUBLE)" for w in grid)
    rows = con.execute(
        f"""
        WITH cell AS (
            SELECT cell_l2, month, period, {_KEY_SUMS} FROM {panel} GROUP BY ALL
        ),
        region_year AS (
            SELECT year, month, period, {_KEY_SUMS} FROM {panel} GROUP BY ALL
        ),
        region AS (
            SELECT month, period, sum(sum_aqua_pos) AS sum_aqua_pos, sum(sum_viirs_pos) AS sum_viirs_pos,
                   sum(n_zero) AS n_zero, sum(sum_viirs_zero) AS sum_viirs_zero
            FROM region_year GROUP BY ALL
        ),
        held_out AS (  -- sums without the row's own year
            SELECT p.a, p.v,
                   c.sum_aqua_pos   - CASE WHEN p.a > 0 THEN p.a ELSE 0 END AS a_pos,
                   c.sum_viirs_pos  - CASE WHEN p.a > 0 THEN p.v ELSE 0 END AS v_pos,
                   c.n_zero         - CASE WHEN p.a = 0 THEN 1 ELSE 0 END   AS n_zero,
                   c.sum_viirs_zero - CASE WHEN p.a = 0 THEN p.v ELSE 0 END AS v_zero,
                   (r.sum_viirs_pos - ry.sum_viirs_pos)
                       / nullif(r.sum_aqua_pos - ry.sum_aqua_pos, 0) AS r_reg,
                   (r.sum_viirs_zero - ry.sum_viirs_zero)
                       / nullif(r.n_zero - ry.n_zero, 0)             AS b_reg
            FROM {panel} p
            JOIN cell c USING (cell_l2, month, period)
            JOIN region r USING (month, period)
            JOIN region_year ry USING (year, month, period)
        )
        SELECT g.w AS weight,
               avg(abs(v - a * {_f_sql("a_pos", "v_pos", "r_reg", "g.w")})) FILTER (WHERE a > 0) AS mae_pos,
               avg(abs(v - {_b_sql("n_zero", "v_zero", "b_reg", "g.w")})) FILTER (WHERE a = 0)   AS mae_zero,
               count(*) FILTER (WHERE a > 0) AS n_pos,
               count(*) FILTER (WHERE a = 0) AS n_zero
        FROM held_out CROSS JOIN (VALUES {weights}) g(w)
        GROUP BY g.w ORDER BY g.w
        """
    ).fetchall()
    return [dict(zip(("weight", "mae_pos", "mae_zero", "n_pos", "n_zero"), r, strict=True)) for r in rows]


def choose_weights(scores: Sequence[dict]) -> tuple[float, float]:
    """(K, M) with the lowest out-of-year error; ties go to the larger weight (more pooling)."""
    def best(metric: str) -> float:
        valid = [s for s in scores if s[metric] is not None]
        if not valid:
            raise ValueError(f"no valid {metric} score: the panel has no such months")
        return min(valid, key=lambda s: (round(s[metric], 9), -s["weight"]))["weight"]

    return best("mae_pos"), best("mae_zero")
