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

import math
from collections.abc import Iterable, Sequence

import duckdb

SOURCE = "Aqua"
REFERENCE = "SNPP"
# Second MODIS satellite, about three hours earlier. Never added to Aqua: it only tells the background
# whether there was fire activity in the cell that month that Aqua did not record.
WITNESS = "Terra"
PERIODS = ("D", "N")
WEIGHT_GRID = (0, 2, 5, 10, 20, 50, 100, 200)
# What a cell with little data leans on: the whole extent, or its 1° parent cell (itself pooled to the
# extent).
POOL_LEVELS = ("region", "l1")
PARENT = "split_part(cell_l2, '.', 1)"
# Reconciliation with the regional ratio (see `fit_factors`): candidate strengths, the improvement in
# out-of-year deviance needed to use it at all, and the regional Aqua count below which it is not applied.
RECONCILE_GRID = (0, 0.25, 0.5, 0.75, 1)
RECONCILE_MIN_GAIN = 0.005
RECONCILE_MIN_REGIONAL_AQUA = 30
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
    witness: str = WITNESS,
    witness_gap_months: Sequence[tuple[int, int]] = (),
) -> str:
    """Paired table: one row per universe cell × year × month × period with `a` (source) and `v` (reference).

    Only use years in which both satellites operated for the whole year, apart from `exclude_months`.
    `t` is the witness satellite's count in the same cell, month and period: 0 when it recorded nothing,
    null in `witness_gap_months` (months in which the witness was not fully observing). The witness never
    decides which cells are in the panel.
    """
    excluded = ", ".join(f"({y}, {m})" for y, m in exclude_months) or "(NULL, NULL)"
    witness_gaps = ", ".join(f"({y}, {m})" for y, m in witness_gap_months) or "(NULL, NULL)"
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
        w AS (
            SELECT cell_l2, year::INT AS year, month::INT AS month, daynight AS period,
                   sum(n_hotspots)::BIGINT AS t
            FROM {counts}
            WHERE year IN ({_in_list(years)}) AND satellite = $witness AND daynight IN ('D', 'N')
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
               coalesce(c.a, 0)::BIGINT AS a, coalesce(c.v, 0)::BIGINT AS v,
               CASE WHEN (g.year, g.month) IN ({witness_gaps}) THEN NULL
                    ELSE coalesce(w.t, 0) END::BIGINT AS t
        FROM grid g
        LEFT JOIN c USING (cell_l2, year, month, period)
        LEFT JOIN w USING (cell_l2, year, month, period)
        """,
        {"source": source, "reference": reference, "witness": witness},
    )
    return name


def _check_pool(pool: str) -> None:
    if pool not in POOL_LEVELS:
        raise ValueError(f"pool must be one of {POOL_LEVELS}")


def fit_factors(
    con: duckdb.DuckDBPyConnection,
    panel: str,
    *,
    k: float,
    m: float,
    pool: str = "region",
    name: str = "factors",
    model_version: str = "dev",
    witness: bool = False,
    m_witness: float | None = None,
    reconcile_lambda: float = 0.0,
) -> str:
    """Factors per `cell_l2 × month × period`, with the columns of `processed/factors/v1`.

    `reconcile_lambda` (0 to 1) is stored with the regional ratio `r_total` (all S-NPP over all Aqua for
    the month and period). When estimates are applied, each month's cell estimates are scaled so that their
    sum moves that fraction of the way toward `regional Aqua × r_total`: the cells keep their spatial
    pattern and the regional total borrows the stability of the simple ratio.

    With `witness`, the background is also fitted separately for months in which the witness satellite
    recorded something in the cell (`b_witness1`) and months in which it did not (`b_witness0`), with
    pooling weight `m_witness` (default `m`). `b` stays the background for when the witness is unknown.

    `pool = "region"`: a cell leans on the ratio of the whole panel for the same month and period.
    `pool = "l1"`: it leans on its 1° parent cell, whose own ratio leans on the whole panel with the same
    weight. `r_parent` and `b_parent` are the values the cell was pooled toward.
    `f` is null when the region has no Aqua detections at all for that month and period; `b` is null when
    it has no zero-Aqua month.
    """
    if k < 0 or m < 0:
        raise ValueError("k and m must be >= 0")
    _check_pool(pool)
    r_parent, b_parent = "r.r_region", "r.b_region"
    if pool == "l1":
        r_parent = _f_sql("p.sum_aqua_pos", "p.sum_viirs_pos", "r.r_region", "$k")
        b_parent = _b_sql("p.n_zero", "p.sum_viirs_zero", "r.b_region", "$m")
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH cell AS (
            SELECT cell_l2, {PARENT} AS cell_l1, month, period, {_KEY_SUMS} FROM {panel} GROUP BY ALL
        ),
        region AS (
            SELECT month, period,
                   sum(sum_viirs_pos) / nullif(sum(sum_aqua_pos), 0) AS r_region,
                   sum(sum_viirs_zero) / nullif(sum(n_zero), 0)      AS b_region
            FROM cell GROUP BY ALL
        ),
        parent_sums AS (
            SELECT cell_l1, month, period,
                   sum(sum_aqua_pos) AS sum_aqua_pos, sum(sum_viirs_pos) AS sum_viirs_pos,
                   sum(n_zero) AS n_zero, sum(sum_viirs_zero) AS sum_viirs_zero
            FROM cell GROUP BY ALL
        ),
        parent AS (
            SELECT p.cell_l1, p.month, p.period, r.r_region, r.b_region,
                   {r_parent} AS r_parent, {b_parent} AS b_parent
            FROM parent_sums p JOIN region r USING (month, period)
        )
        SELECT c.cell_l2, c.month, c.period,
               {_f_sql("c.sum_aqua_pos", "c.sum_viirs_pos", "t.r_parent", "$k")} AS f,
               {_b_sql("c.n_zero", "c.sum_viirs_zero", "t.b_parent", "$m")}      AS b,
               c.sum_aqua_pos, c.sum_viirs_pos, c.n_zero, c.sum_viirs_zero,
               t.r_region, t.b_region,
               $k::DOUBLE AS k, $m::DOUBLE AS m,
               CASE WHEN c.sum_aqua_pos = 0 THEN 0
                    ELSE c.sum_aqua_pos / (c.sum_aqua_pos + $k) END AS weight_cell,
               (SELECT string_agg(DISTINCT year::VARCHAR, ',' ORDER BY year::VARCHAR) FROM {panel})
                   AS calibration_years,
               $model_version AS model_version,
               t.r_parent, t.b_parent, $pool AS pool_level
        FROM cell c JOIN parent t USING (cell_l1, month, period)
        """,
        {"k": float(k), "m": float(m), "model_version": model_version, "pool": pool},
    )
    _add_witness_background(con, panel, name, pool, m if m_witness is None else m_witness, witness)
    if not 0 <= reconcile_lambda <= 1:
        raise ValueError("reconcile_lambda must be between 0 and 1")
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH total AS (
            SELECT month, period, sum(v) / nullif(sum(a), 0) AS r_total FROM {panel} GROUP BY ALL
        )
        SELECT f.*, t.r_total, $lam::DOUBLE AS reconcile_lambda,
               {RECONCILE_MIN_REGIONAL_AQUA}::BIGINT AS reconcile_min_regional_aqua
        FROM {name} f LEFT JOIN total t USING (month, period)
        """,
        {"lam": float(reconcile_lambda)},
    )
    return name


RECONCILE_COLUMNS = ("r_total", "reconcile_lambda", "reconcile_min_regional_aqua")


def reconcile_sql(estimate: str, regional_aqua: str, regional_estimate: str, r_total: str, lam: str,
                  min_aqua: str) -> str:
    """Estimate scaled toward the regional ratio. No scaling when regional Aqua is below `min_aqua`."""
    scale = (f"CASE WHEN {regional_aqua} < {min_aqua} OR {regional_estimate} IS NULL "
             f"OR {regional_estimate} = 0 OR {r_total} IS NULL THEN 1 "
             f"ELSE {regional_aqua} * {r_total} / {regional_estimate} END")
    return f"{estimate} * ((1 - {lam}) + {lam} * {scale})"


WITNESS_COLUMNS = (
    "b_witness0", "b_witness1", "n_zero_witness0", "n_zero_witness1",
    "sum_viirs_zero_witness0", "sum_viirs_zero_witness1", "b_parent_witness0", "b_parent_witness1",
    "m_witness", "witness_satellite",
)


def _add_witness_background(con, panel: str, factors: str, pool: str, m: float, enabled: bool) -> None:
    """Add the witness columns to `factors` (all null when the witness is not used)."""
    if not enabled:
        nulls = ", ".join(f"NULL::{'VARCHAR' if c == 'witness_satellite' else 'DOUBLE'} AS {c}"
                          for c in WITNESS_COLUMNS)
        con.execute(f"CREATE OR REPLACE TEMP TABLE {factors} AS SELECT *, {nulls} FROM {factors}")
        return
    if m < 0:
        raise ValueError("m_witness must be >= 0")
    b_parent = _b_sql("coalesce(p.n, 0)", "coalesce(p.sv, 0)", "r.sv / nullif(r.n, 0)", "$m")
    if pool != "l1":
        b_parent = "r.sv / nullif(r.n, 0)"
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {factors} AS
        WITH z AS (  -- zero-Aqua months with a known witness
            SELECT cell_l2, {PARENT} AS cell_l1, month, period, t > 0 AS w, v
            FROM {panel} WHERE a = 0 AND t IS NOT NULL
        ),
        cell AS (SELECT cell_l2, cell_l1, month, period, w, count(*) AS n, sum(v) AS sv FROM z GROUP BY ALL),
        par AS (SELECT cell_l1, month, period, w, sum(n) AS n, sum(sv) AS sv FROM cell GROUP BY ALL),
        reg AS (SELECT month, period, w, sum(n) AS n, sum(sv) AS sv FROM cell GROUP BY ALL),
        keys AS (
            SELECT f.cell_l2, {PARENT} AS cell_l1, f.month, f.period, s.w
            FROM {factors} f CROSS JOIN (VALUES (false), (true)) s(w)
        ),
        fitted AS (
            SELECT k.cell_l2, k.month, k.period, k.w,
                   coalesce(c.n, 0) AS n_zero, coalesce(c.sv, 0) AS v_zero, {b_parent} AS b_parent
            FROM keys k
            LEFT JOIN (SELECT cell_l2, month, period, w, n, sv FROM cell) c USING (cell_l2, month, period, w)
            LEFT JOIN par p USING (cell_l1, month, period, w)
            LEFT JOIN reg r USING (month, period, w)
        ),
        wide AS (
            SELECT cell_l2, month, period,
                   max({_b_sql("n_zero", "v_zero", "b_parent", "$m")}) FILTER (WHERE NOT w) AS b_witness0,
                   max({_b_sql("n_zero", "v_zero", "b_parent", "$m")}) FILTER (WHERE w)     AS b_witness1,
                   max(n_zero) FILTER (WHERE NOT w) AS n_zero_witness0,
                   max(n_zero) FILTER (WHERE w)     AS n_zero_witness1,
                   max(v_zero) FILTER (WHERE NOT w) AS sum_viirs_zero_witness0,
                   max(v_zero) FILTER (WHERE w)     AS sum_viirs_zero_witness1,
                   max(b_parent) FILTER (WHERE NOT w) AS b_parent_witness0,
                   max(b_parent) FILTER (WHERE w)     AS b_parent_witness1
            FROM fitted GROUP BY ALL
        )
        SELECT f.*, x.* EXCLUDE (cell_l2, month, period), $m::DOUBLE AS m_witness, $sat AS witness_satellite
        FROM {factors} f JOIN wide x USING (cell_l2, month, period)
        """,
        {"m": float(m), "sat": WITNESS},
    )


def witness_panel(con: duckdb.DuckDBPyConnection, panel: str, name: str = "panel_witness") -> str:
    """The panel with the witness state folded into `period` ('D|0', 'D|1', ...), witness-known rows only.

    `leave_one_year_out` on this table scores the witness background: read its `*_zero` columns.
    """
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        SELECT cell_l2, year, month, period || CASE WHEN t > 0 THEN '|1' ELSE '|0' END AS period, a, v, t
        FROM {panel} WHERE t IS NOT NULL
        """
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
    witness: str = WITNESS,
    witness_gap_months: Sequence[tuple[int, int]] = (),
) -> str:
    """Source-satellite counts to convert: `cell_l2, year, month, period, a, t`.

    `months` lists the (year, month) pairs in which the source satellite was operating. Cells of the
    calibration universe get a = 0 where the satellite reported nothing; other cells appear only where
    they have detections. `t` is the witness count: 0 when it recorded nothing, null in
    `witness_gap_months` (pass every month in which the witness was not fully observing or did not exist).
    """
    witness_gaps = ", ".join(f"({y}, {mo})" for y, mo in witness_gap_months) or "(NULL, NULL)"
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
        ),
        w AS (
            SELECT cell_l2, year::INT AS year, month::INT AS month, daynight AS period,
                   sum(n_hotspots)::BIGINT AS t
            FROM {counts} JOIN months USING (year, month)
            WHERE satellite = $witness AND daynight IN ('D', 'N')
            GROUP BY ALL
        ),
        rows AS (
            SELECT cell_l2, year, month, period, coalesce(o.a, 0)::BIGINT AS a
            FROM grid g FULL JOIN obs o USING (cell_l2, year, month, period)
        )
        SELECT r.*, CASE WHEN (r.year, r.month) IN ({witness_gaps}) THEN NULL
                         ELSE coalesce(w.t, 0) END::BIGINT AS t
        FROM rows r LEFT JOIN w USING (cell_l2, year, month, period)
        """,
        {"source": source, "witness": witness},
    )
    return name


# Background for a zero-Aqua month, given the witness count `s.t` (null = unknown).
BACKGROUND_SQL = (
    "CASE WHEN s.t IS NULL THEN f.b WHEN s.t > 0 THEN coalesce(f.b_witness1, f.b) "
    "ELSE coalesce(f.b_witness0, f.b) END"
)
BACKGROUND_RULE_SQL = (
    "CASE WHEN s.t IS NULL OR f.b_witness0 IS NULL THEN 'background' "
    "WHEN s.t > 0 THEN 'background_witness_active' ELSE 'background_witness_quiet' END"
)


def _has_column(con: duckdb.DuckDBPyConnection, table: str, column: str) -> bool:
    return any(r[0] == column for r in con.execute(f"DESCRIBE {table}").fetchall())


def apply_factors(
    con: duckdb.DuckDBPyConnection,
    source: str,
    factors: str,
    *,
    name: str = "estimates",
    use_background: bool = True,
    reconcile: bool = True,
) -> str:
    """VIIRS-equivalent estimate for every row of `source` (`cell_l2, year, month, period, a`, optional `t`).

    - Aqua > 0: `F × Aqua`; a cell without its own factor uses the regional ratio.
    - Aqua = 0: the background for cells of the calibration universe; rows of other cells are dropped.
      With a witness count `t` and fitted witness backgrounds, `b_witness1` when t > 0 and `b_witness0`
      when t = 0; plain `b` when the witness is unknown.
    - The estimate is null (missing, never zero) when no factor exists for that month and period.
    - With `reconcile` and a stored `reconcile_lambda` > 0, each month and period is then scaled toward
      `regional Aqua × r_total`. **`source` must then hold the whole extent**, not a subset of cells:
      the scale is computed from its sums. `estimate_unreconciled` keeps the value before scaling.
    """
    with_witness = use_background and _has_column(con, source, "t")
    background = BACKGROUND_SQL if with_witness else ("f.b" if use_background else "0")
    rule = BACKGROUND_RULE_SQL if with_witness else "'background'"
    can_reconcile = reconcile and use_background and _has_column(con, factors, "reconcile_lambda")
    lam = f"(SELECT coalesce(max(reconcile_lambda), 0) FROM {factors})" if can_reconcile else "0"
    r_total = "any_value(r_total)" if can_reconcile else "NULL::DOUBLE"
    reconciled = reconcile_sql("e.estimate_unreconciled", "g.regional_aqua", "g.regional_estimate",
                               "g.r_total", lam, str(RECONCILE_MIN_REGIONAL_AQUA))
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH region AS (
            SELECT month, period, any_value(r_region) AS r_region, {r_total} AS r_total
            FROM {factors} GROUP BY ALL
        ),
        e AS (
            SELECT s.cell_l2, s.year, s.month, s.period, s.a AS raw_aqua,
                   CASE WHEN s.a > 0 THEN s.a * coalesce(f.f, r.r_region) ELSE {background} END
                       AS estimate_unreconciled,
                   CASE WHEN s.a = 0 THEN {rule}
                        WHEN f.f IS NOT NULL THEN 'cell_factor'
                        ELSE 'regional_factor' END AS estimate_rule,
                   r.r_total
            FROM {source} s
            LEFT JOIN {factors} f USING (cell_l2, month, period)
            LEFT JOIN region r USING (month, period)
            WHERE s.a > 0 OR f.cell_l2 IS NOT NULL
        ),
        g AS (
            SELECT year, month, period, sum(raw_aqua) AS regional_aqua,
                   sum(estimate_unreconciled) AS regional_estimate, any_value(r_total) AS r_total
            FROM e GROUP BY ALL
        )
        SELECT e.cell_l2, e.year, e.month, e.period, e.raw_aqua,
               {reconciled} AS estimate, e.estimate_rule, e.estimate_unreconciled
        FROM e JOIN g USING (year, month, period)
        """
    )
    return name


def _deviance_sql(mu: str) -> str:
    """Poisson deviance of one observation `v` given the predicted mean.

    Infinite when a mean of zero meets v > 0.
    """
    return (f"CASE WHEN v = 0 THEN 2 * ({mu}) WHEN ({mu}) <= 0 THEN 'infinity'::DOUBLE "
            f"ELSE 2 * (v * ln(v / ({mu})) - (v - ({mu}))) END")


def leave_one_year_out(
    con: duckdb.DuckDBPyConnection,
    panel: str,
    grid: Sequence[float] = WEIGHT_GRID,
    *,
    pool: str = "region",
) -> list[dict]:
    """Out-of-year error for each pooling weight, using calibration years only.

    Each year is predicted from factors fitted on the other years. K only affects months with Aqua > 0
    and M only months with Aqua = 0, so the two are scored separately (`*_pos` for `F × Aqua`, `*_zero`
    for `B`). Three scores each: mean absolute error, root mean squared error and mean Poisson deviance.

    The deviance is the one to choose weights by: it scores the predicted *mean* under the count model.
    Absolute error is minimized by the median, which for counts that are mostly zero is zero, so it
    rewards leaving the background out. A deviance of None means infinite: some month with detections was
    given a mean of exactly zero, which happens without pooling.
    """
    _check_pool(pool)
    weights = ", ".join(f"({float(w)}::DOUBLE)" for w in grid)
    if pool == "l1":
        r_target = _f_sql("pa_pos", "pv_pos", "r_reg", "g.w")
        b_target = _b_sql("pn_zero", "pv_zero", "b_reg", "g.w")
    else:
        r_target, b_target = "r_reg", "b_reg"
    mu_pos = f"a * {_f_sql('a_pos', 'v_pos', '(' + r_target + ')', 'g.w')}"
    mu_zero = _b_sql("n_zero", "v_zero", "(" + b_target + ")", "g.w")
    sums = ("sum(sum_aqua_pos) AS sum_aqua_pos, sum(sum_viirs_pos) AS sum_viirs_pos, "
            "sum(n_zero) AS n_zero, sum(sum_viirs_zero) AS sum_viirs_zero")
    own = {  # the row's own contribution to each sum
        "sum_aqua_pos": "CASE WHEN p.a > 0 THEN p.a ELSE 0 END",
        "sum_viirs_pos": "CASE WHEN p.a > 0 THEN p.v ELSE 0 END",
        "n_zero": "CASE WHEN p.a = 0 THEN 1 ELSE 0 END",
        "sum_viirs_zero": "CASE WHEN p.a = 0 THEN p.v ELSE 0 END",
    }
    cur = con.execute(
        f"""
        WITH cell AS (
            SELECT cell_l2, month, period, {_KEY_SUMS} FROM {panel} GROUP BY ALL
        ),
        parent_year AS (
            SELECT {PARENT} AS cell_l1, year, month, period, {_KEY_SUMS} FROM {panel} GROUP BY ALL
        ),
        parent AS (SELECT cell_l1, month, period, {sums} FROM parent_year GROUP BY ALL),
        region_year AS (SELECT year, month, period, {sums} FROM parent_year GROUP BY ALL),
        region AS (SELECT month, period, {sums} FROM region_year GROUP BY ALL),
        held_out AS (  -- every sum without the row's own year
            SELECT p.a, p.v,
                   c.sum_aqua_pos   - {own["sum_aqua_pos"]}   AS a_pos,
                   c.sum_viirs_pos  - {own["sum_viirs_pos"]}  AS v_pos,
                   c.n_zero         - {own["n_zero"]}         AS n_zero,
                   c.sum_viirs_zero - {own["sum_viirs_zero"]} AS v_zero,
                   pa.sum_aqua_pos - py.sum_aqua_pos     AS pa_pos,
                   pa.sum_viirs_pos - py.sum_viirs_pos   AS pv_pos,
                   pa.n_zero - py.n_zero                 AS pn_zero,
                   pa.sum_viirs_zero - py.sum_viirs_zero AS pv_zero,
                   (r.sum_viirs_pos - ry.sum_viirs_pos)
                       / nullif(r.sum_aqua_pos - ry.sum_aqua_pos, 0) AS r_reg,
                   (r.sum_viirs_zero - ry.sum_viirs_zero)
                       / nullif(r.n_zero - ry.n_zero, 0)             AS b_reg
            FROM (SELECT *, {PARENT} AS cell_l1 FROM {panel}) p
            JOIN cell c USING (cell_l2, month, period)
            JOIN parent pa USING (cell_l1, month, period)
            JOIN parent_year py USING (cell_l1, year, month, period)
            JOIN region r USING (month, period)
            JOIN region_year ry USING (year, month, period)
        ),
        scored AS (
            SELECT g.w, a, v, {mu_pos} AS mu_pos, {mu_zero} AS mu_zero
            FROM held_out CROSS JOIN (VALUES {weights}) g(w)
        )
        SELECT w AS weight,
               avg(abs(v - mu_pos)) FILTER (WHERE a > 0)                 AS mae_pos,
               sqrt(avg(pow(v - mu_pos, 2)) FILTER (WHERE a > 0))        AS rmse_pos,
               avg({_deviance_sql("mu_pos")}) FILTER (WHERE a > 0)       AS deviance_pos,
               avg(abs(v - mu_zero)) FILTER (WHERE a = 0)                AS mae_zero,
               sqrt(avg(pow(v - mu_zero, 2)) FILTER (WHERE a = 0))       AS rmse_zero,
               avg({_deviance_sql("mu_zero")}) FILTER (WHERE a = 0)      AS deviance_zero,
               count(*) FILTER (WHERE a > 0) AS n_pos,
               count(*) FILTER (WHERE a = 0) AS n_zero
        FROM scored GROUP BY w ORDER BY w
        """
    )
    names = [d[0] for d in cur.description]
    out = []
    for row in cur.fetchall():
        rec = dict(zip(names, row, strict=True))
        out.append({key: (None if isinstance(val, float) and not math.isfinite(val) else val)
                    for key, val in rec.items()} | {"pool": pool})
    return out


def best_weight(scores: Sequence[dict], column: str) -> float:
    """Weight with the lowest out-of-year score in `column`; ties go to the larger weight (more pooling)."""
    valid = [s for s in scores if s[column] is not None]
    if not valid:
        raise ValueError(f"no finite {column} score: the panel has no such months")
    return min(valid, key=lambda s: (round(s[column], 9), -s["weight"]))["weight"]


def choose_weights(scores: Sequence[dict], metric: str = "deviance") -> tuple[float, float]:
    """(K, M) with the lowest out-of-year score; ties go to the larger weight (more pooling)."""
    return best_weight(scores, f"{metric}_pos"), best_weight(scores, f"{metric}_zero")


def choose_pooling(
    con: duckdb.DuckDBPyConnection,
    panel: str,
    grid: Sequence[float] = WEIGHT_GRID,
    pools: Sequence[str] = POOL_LEVELS,
    witness: bool | None = None,
) -> dict:
    """Pooling level, weights and background type with the lowest out-of-year Poisson deviance.

    Uses the calibration years only. `witness`: True or False fixes whether the background uses the
    witness satellite; None compares both on the months where the witness is known and keeps the better.
    Returns `{"pool", "k", "m", "witness", "m_witness", "deviance", "scores"}`; `scores` holds every
    combination tried (`background`: static or witness).
    """
    has_witness = _has_column(con, panel, "t") and con.execute(
        f"SELECT count(*) FROM {panel} WHERE t IS NOT NULL").fetchone()[0] > 0
    if witness and not has_witness:
        raise ValueError("the panel has no witness counts")
    compare_witness = has_witness and witness is not False
    if compare_witness:
        witness_panel(con, panel, "_panel_witness")
        con.execute(f"CREATE OR REPLACE TEMP TABLE _panel_known AS SELECT * FROM {panel} WHERE t IS NOT NULL")
    scores: list[dict] = []
    best: dict | None = None
    for pool in pools:
        rows = leave_one_year_out(con, panel, grid, pool=pool)
        scores += [{**r, "background": "static"} for r in rows]
        k, m = choose_weights(rows)
        by_weight = {r["weight"]: r for r in rows}
        pos, zero = by_weight[k], by_weight[m]
        candidate = {"pool": pool, "k": k, "m": m, "witness": False, "m_witness": None}
        zero_deviance = zero["deviance_zero"]
        if compare_witness:
            known = leave_one_year_out(con, "_panel_known", grid, pool=pool)
            with_witness = leave_one_year_out(con, "_panel_witness", grid, pool=pool)
            scores += [{**r, "background": "witness"} for r in with_witness]
            static_known = min(r["deviance_zero"] for r in known if r["deviance_zero"] is not None)
            m_w = best_weight(with_witness, "deviance_zero")  # only the zero-Aqua part uses the witness
            witness_deviance = {r["weight"]: r for r in with_witness}[m_w]["deviance_zero"]
            candidate |= {"deviance_zero_static_same_months": static_known,
                          "deviance_zero_witness": witness_deviance}
            if witness or witness_deviance < static_known:
                candidate |= {"witness": True, "m_witness": m_w}
                zero_deviance = witness_deviance
        n = pos["n_pos"] + zero["n_zero"]
        candidate["deviance"] = (pos["deviance_pos"] * pos["n_pos"] + zero_deviance * zero["n_zero"]) / n
        if best is None or candidate["deviance"] < best["deviance"] - 1e-12:
            best = candidate
    return {**best, "scores": scores}


def reconcile_scores(
    con: duckdb.DuckDBPyConnection,
    panel: str,
    *,
    k: float,
    m: float,
    pool: str,
    witness: bool,
    m_witness: float | None,
    lambdas: Sequence[float] = RECONCILE_GRID,
) -> list[dict]:
    """Out-of-year scores of the reconciliation strength, calibration years only.

    Each year is predicted by the full model fitted on the other years (one refit per year), then scaled
    toward that year's regional ratio estimate for every lambda. Returns one dict per lambda with the
    cell-month deviance, MAE and RMSE and the MAE of regional monthly totals.
    """
    years = [r[0] for r in con.execute(f"SELECT DISTINCT year FROM {panel} ORDER BY 1").fetchall()]
    background = BACKGROUND_SQL.replace("s.t", "p.t") if witness else "f.b"
    con.execute(
        "CREATE OR REPLACE TEMP TABLE _loo (year INT, month INT, period VARCHAR, a BIGINT, v BIGINT, "
        "mu DOUBLE, r_total DOUBLE)"
    )
    for held in years:
        con.execute(f"CREATE OR REPLACE TEMP TABLE _train AS SELECT * FROM {panel} WHERE year <> {held}")
        fit_factors(con, "_train", k=k, m=m, pool=pool, witness=witness, m_witness=m_witness, name="_fold")
        con.execute(
            f"""
            INSERT INTO _loo
            SELECT p.year, p.month, p.period, p.a, p.v,
                   CASE WHEN p.a > 0 THEN p.a * f.f ELSE {background} END, f.r_total
            FROM {panel} p JOIN _fold f USING (cell_l2, month, period)
            WHERE p.year = {held}
            """
        )
    out = []
    for lam in lambdas:
        final = reconcile_sql("l.mu", "g.ra", "g.smu", "g.r_total", str(float(lam)),
                              str(RECONCILE_MIN_REGIONAL_AQUA))
        row = con.execute(
            f"""
            WITH g AS (
                SELECT year, month, period, sum(a) AS ra, sum(mu) AS smu, any_value(r_total) AS r_total
                FROM _loo GROUP BY ALL
            ),
            scored AS (
                SELECT l.year, l.month, l.v, {final} AS mu FROM _loo l JOIN g USING (year, month, period)
            ),
            region AS (SELECT year, month, sum(mu) AS mu, sum(v) AS v FROM scored GROUP BY ALL)
            SELECT (SELECT avg({_deviance_sql("mu")}) FROM scored),
                   (SELECT avg(abs(mu - v)) FROM scored),
                   (SELECT sqrt(avg(pow(mu - v, 2))) FROM scored),
                   (SELECT avg(abs(mu - v)) FROM region),
                   (SELECT (sum(mu) - sum(v)) / nullif(sum(v), 0) FROM region)
            """
        ).fetchone()
        names = ("deviance", "mae", "rmse", "region_month_mae", "bias_rel")
        rec = {"lambda": float(lam), **dict(zip(names, row, strict=True))}
        out.append({key: (None if isinstance(val, float) and not math.isfinite(val) else val)
                    for key, val in rec.items()})
    return out


def choose_lambda(scores: Sequence[dict], min_gain: float = RECONCILE_MIN_GAIN) -> float:
    """Strength with the lowest out-of-year deviance; 0 unless it beats no reconciliation by `min_gain`."""
    valid = [s for s in scores if s["deviance"] is not None]
    base = next((s["deviance"] for s in valid if s["lambda"] == 0), None)
    if not valid or base is None:
        return 0.0
    best = min(valid, key=lambda s: (round(s["deviance"], 9), s["lambda"]))
    return best["lambda"] if best["deviance"] <= base * (1 - min_gain) else 0.0
