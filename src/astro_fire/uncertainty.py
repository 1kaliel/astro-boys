"""Prediction intervals for the VIIRS-equivalent estimates, from measured out-of-year error.

For every calibration year, the full method is refitted on the other years and applied to that year exactly
as in production (`apply_factors`). Comparing those estimates with what S-NPP observed gives the real
prediction error: factor uncertainty, year-to-year variation of the sensor relation and the scatter of the
counts, all at once. The errors are summarized by the size of the estimate (bins of log2) and by regime
(Aqua > 0 or Aqua = 0; day, night, or the two summed):

    variance_ratio   mean squared error / mean estimate    → var = variance_ratio × estimate
    q05_ratio, q95_ratio   5th and 95th percentiles of observed / estimate → the 90% interval

This replaces a bootstrap over calibration years, which only measures how uncertain the factors are and
gives intervals far narrower than the errors actually observed. Calibration years only; the held-out
years are used afterwards to check how often the intervals contain the truth.
"""

from __future__ import annotations

from collections.abc import Sequence

import duckdb

from astro_fire import calibration as cal

BIN_MIN, BIN_MAX = -4, 9   # log2 of the estimate: below 1/16 and above 512 share the end bins
MIN_ROWS_PER_BIN = 200     # bins with fewer out-of-year rows borrow the nearest bin that has enough
REGIME_SQL = "CASE WHEN raw_aqua > 0 THEN 'aqua_positive' ELSE 'aqua_zero' END"
BIN_SQL = f"greatest({BIN_MIN}, least({BIN_MAX}, floor(log2(estimate))))::INT"


def out_of_year_estimates(
    con: duckdb.DuckDBPyConnection,
    panel: str,
    *,
    k: float,
    m: float,
    pool: str,
    witness: bool,
    m_witness: float | None,
    reconcile_lambda: float,
    name: str = "out_of_year",
) -> str:
    """Estimate and observation for every panel row, each year predicted from the other years."""
    years = [r[0] for r in con.execute(f"SELECT DISTINCT year FROM {panel} ORDER BY 1").fetchall()]
    con.execute(
        f"CREATE OR REPLACE TEMP TABLE {name} (cell_l2 VARCHAR, year INT, month INT, period VARCHAR, "
        "raw_aqua BIGINT, estimate DOUBLE, observed BIGINT)"
    )
    for held in years:
        con.execute(f"CREATE OR REPLACE TEMP TABLE _train AS SELECT * FROM {panel} WHERE year <> {held}")
        cal.fit_factors(con, "_train", k=k, m=m, pool=pool, witness=witness, m_witness=m_witness,
                        reconcile_lambda=reconcile_lambda, name="_fold")
        con.execute(f"CREATE OR REPLACE TEMP TABLE _held AS SELECT * FROM {panel} WHERE year = {held}")
        cal.apply_factors(con, "_held", "_fold", name="_held_estimates")
        con.execute(
            f"""
            INSERT INTO {name}
            SELECT e.cell_l2, e.year, e.month, e.period, e.raw_aqua, e.estimate, h.v
            FROM _held_estimates e JOIN _held h USING (cell_l2, year, month, period)
            """
        )
    return name


def error_table(
    con: duckdb.DuckDBPyConnection, out_of_year: str, *, name: str = "uncertainty",
    min_rows: int = MIN_ROWS_PER_BIN,
) -> str:
    """Error summary per regime, period and size bin of the estimate; thin bins borrow from a neighbor."""
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH periods AS (  -- day and night rows, plus their sum per cell and month as period 'ALL'
            SELECT period, raw_aqua, estimate, observed FROM {out_of_year}
            UNION ALL
            SELECT 'ALL', sum(raw_aqua), sum(estimate), sum(observed)
            FROM {out_of_year} GROUP BY cell_l2, year, month HAVING count(estimate) = count(*)
        ),
        rows AS (
            SELECT {REGIME_SQL} AS regime, period, {BIN_SQL} AS bin, estimate, observed
            FROM periods WHERE estimate > 0
        ),
        stats AS (
            SELECT regime, period, bin, count(*) AS n, avg(estimate) AS mean_estimate,
                   avg(pow(observed - estimate, 2)) / avg(estimate) AS variance_ratio,
                   quantile_cont(observed / estimate, 0.05) AS q05_ratio,
                   quantile_cont(observed / estimate, 0.95) AS q95_ratio
            FROM rows GROUP BY ALL
        ),
        grid AS (
            SELECT r.regime, p.period, b.bin
            FROM (VALUES ('aqua_positive'), ('aqua_zero')) r(regime),
                 (VALUES ('D'), ('N'), ('ALL')) p(period), range({BIN_MIN}, {BIN_MAX + 1}) b(bin)
        )
        SELECT g.regime, g.period, g.bin, coalesce(s.n, 0) AS n_rows, d.bin AS bin_used, d.n AS n_rows_used,
               d.variance_ratio, d.q05_ratio, d.q95_ratio
        FROM grid g
        LEFT JOIN stats s USING (regime, period, bin)
        LEFT JOIN LATERAL (
            SELECT * FROM stats x
            WHERE x.regime = g.regime AND x.period = g.period
            ORDER BY (x.n >= {int(min_rows)}) DESC, abs(x.bin - g.bin), x.bin LIMIT 1
        ) d ON true
        """
    )
    return name


def interval_columns(estimate: str = "e.estimate", u: str = "u") -> str:
    """SQL for `ci_low, ci_high, var_harmonized` given a joined error-table row `u`.

    The interval always contains the estimate: where nearly every observation was zero the 95th
    percentile is zero too, and the upper bound is then the estimate itself.
    """
    known = f"{u}.q05_ratio IS NOT NULL"  # least/greatest skip nulls, so say it explicitly
    return (f"CASE WHEN {known} THEN least({estimate} * {u}.q05_ratio, {estimate}) END AS ci_low, "
            f"CASE WHEN {known} THEN greatest({estimate} * {u}.q95_ratio, {estimate}) END AS ci_high, "
            f"{estimate} * {u}.variance_ratio AS var_harmonized")


def add_intervals(
    con: duckdb.DuckDBPyConnection, estimates: str, uncertainty: str, *, name: str = "estimates_ci"
) -> str:
    """`estimates` plus `ci_low`, `ci_high` (90%) and `var_harmonized`.

    `estimates` needs `period` ('D', 'N' or 'ALL'), `raw_aqua` and `estimate`. Rows with a null or zero
    estimate get null intervals: nothing is known about their error.
    """
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        SELECT e.*, {interval_columns()}
        FROM {estimates} e
        LEFT JOIN {uncertainty} u
          ON e.estimate > 0 AND u.regime = {REGIME_SQL.replace("raw_aqua", "e.raw_aqua")}
         AND u.period = e.period AND u.bin = {BIN_SQL.replace("estimate", "e.estimate")}
        """
    )
    return name


def coverage(con: duckdb.DuckDBPyConnection, estimates_ci: str, observed: str) -> list[dict]:
    """Share of observed counts inside the 90% interval. `observed`: `cell_l2, year, month, period, v`."""
    cur = con.execute(
        f"""
        SELECT {REGIME_SQL.replace("raw_aqua", "e.raw_aqua")} AS regime, e.period, count(*) AS n,
               avg((o.v BETWEEN e.ci_low AND e.ci_high)::INT) AS inside,
               avg((o.v < e.ci_low)::INT) AS below, avg((o.v > e.ci_high)::INT) AS above
        FROM {estimates_ci} e JOIN {observed} o USING (cell_l2, year, month, period)
        WHERE e.ci_low IS NOT NULL
        GROUP BY ROLLUP (regime, e.period) ORDER BY regime NULLS FIRST, e.period NULLS FIRST
        """
    )
    names = [d[0] for d in cur.description]
    return [dict(zip(names, row, strict=True)) for row in cur.fetchall()]


def summarize(con: duckdb.DuckDBPyConnection, uncertainty: str) -> Sequence[dict]:
    cur = con.execute(f"SELECT * FROM {uncertainty} ORDER BY regime, period, bin")
    names = [d[0] for d in cur.description]
    return [dict(zip(names, row, strict=True)) for row in cur.fetchall()]


def sum_inflation(con: duckdb.DuckDBPyConnection, out_of_year: str, uncertainty: str) -> dict:
    """How much adding cell variances understates the error of a sum, measured on the out-of-year rows.

    Returns, for 1° cells and for the whole extent (per month, day + night), the ratio of the mean squared
    error of the summed estimate to the sum of the cell variances. 1 would mean independent errors.
    """
    add_intervals(con, out_of_year, uncertainty, name="_oy_ci")
    row = con.execute(
        """
        WITH l1 AS (
            SELECT split_part(cell_l2, '.', 1) AS c, year, month,
                   pow(sum(observed) - sum(estimate), 2) AS se, sum(var_harmonized) AS v
            FROM _oy_ci WHERE var_harmonized IS NOT NULL GROUP BY ALL
        ),
        region AS (
            SELECT year, month, pow(sum(observed) - sum(estimate), 2) AS se, sum(var_harmonized) AS v
            FROM _oy_ci WHERE var_harmonized IS NOT NULL GROUP BY ALL
        )
        SELECT (SELECT sum(se) / sum(v) FROM l1), (SELECT sum(se) / sum(v) FROM region)
        """
    ).fetchone()
    return {"l1_cell_month": row[0], "whole_extent_month": row[1]}
