"""Out-of-sample validation of the transfer function (docs/spec/harmonization.md, section 7).

Factors are fitted on the calibration years only. Each method then predicts the S-NPP monthly count of the
test years from Aqua alone, and is scored against what S-NPP observed.

| key                  | method                                          | role      |
|----------------------|-------------------------------------------------|-----------|
| raw_aqua             | Aqua count as it is                             | reference |
| global_ratio         | Aqua × one ratio (ΣV / ΣA over everything)      | baseline  |
| ols                  | a·Aqua + b, one line for everything             | baseline  |
| month_period_ratio   | Aqua × ratio of that month and day/night        | baseline  |
| f_pooled             | F(cell, month, period) × Aqua                   | ablation  |
| f_pooled_static_background | F × Aqua, or the static B where Aqua = 0  | ablation  |
| f_pooled_background  | F × Aqua, or B where Aqua = 0 (final method)    | candidate |

The final method uses the Terra-aware background when the factors carry one, otherwise the static one.
"""

from __future__ import annotations

import random
from collections.abc import Sequence

import duckdb

from astro_fire import calibration as cal

METHODS = (
    ("raw_aqua", "Raw Aqua counts (no harmonization)", "reference"),
    ("global_ratio", "One global ratio", "baseline"),
    ("ols", "OLS line V = a·A + b, global", "baseline"),
    ("month_period_ratio", "Ratio by month × day/night, no cell term", "baseline"),
    ("f_pooled", "F with pooling, no background", "ablation"),
    ("f_pooled_static_background", "F + static background B", "ablation"),
    ("f_pooled_background", "F + background B, Terra-aware where fitted", "candidate"),
)
FINAL = "f_pooled_background"
BASELINES = tuple(key for key, _, role in METHODS if role == "baseline")
_KEYS = ", ".join(key for key, _, _ in METHODS)
_METRICS = """
    count(pred)::BIGINT                               AS n,
    (count(*) - count(pred))::BIGINT                  AS n_missing,
    avg(abs(pred - v))                                AS mae,
    sqrt(avg(pow(pred - v, 2)))                       AS rmse,
    (sum(pred) - sum(v) FILTER (WHERE pred IS NOT NULL))
        / nullif(sum(v) FILTER (WHERE pred IS NOT NULL), 0) AS bias_rel,
    corr(pred, v)                                     AS corr,
    sum(v)::DOUBLE                                    AS sum_observed,
    sum(pred)                                         AS sum_predicted
"""


def build_eval(
    con: duckdb.DuckDBPyConnection, test_panel: str, factors: str, *, name: str = "eval"
) -> str:
    """Test rows to score: `cell_l2, year, month, period, a, v, t`.

    `t` is the witness count from the test panel (null where the witness is unknown, and for cells that
    are only in the calibration universe, where the test panel has no row to say).

    `test_panel` comes from `calibration.build_panel` on the test years (cells active in those years).
    Cells of the calibration universe that were silent in the test years are added with zeros, so a
    background estimate where nothing was observed counts as an error.
    """
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH cells AS (
            SELECT DISTINCT cell_l2 FROM {factors} UNION SELECT DISTINCT cell_l2 FROM {test_panel}
        ),
        slots AS (SELECT DISTINCT year, month, period FROM {test_panel})
        SELECT c.cell_l2, s.year, s.month, s.period,
               coalesce(t.a, 0)::BIGINT AS a, coalesce(t.v, 0)::BIGINT AS v, t.t
        FROM cells c CROSS JOIN slots s
        LEFT JOIN {test_panel} t USING (cell_l2, year, month, period)
        """
    )
    return name


def predict(
    con: duckdb.DuckDBPyConnection, panel: str, factors: str, eval_rows: str, *, name: str = "predictions"
) -> str:
    """One column of predictions per method, for every row of `eval_rows`.

    Baselines are fitted on `panel` (calibration years). A prediction is null when the method has no
    factor for that row; nulls are reported by `score`, never turned into zeros.
    """
    background = cal.BACKGROUND_SQL.replace("s.t", "e.t")
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        WITH g AS (
            SELECT sum(v) / nullif(sum(a), 0) AS ratio,
                   regr_slope(v, a) AS slope, regr_intercept(v, a) AS intercept
            FROM {panel}
        ),
        mp AS (
            SELECT month, period, sum(v) / nullif(sum(a), 0) AS ratio FROM {panel} GROUP BY ALL
        ),
        region AS (
            SELECT month, period, any_value(r_region) AS r_region FROM {factors} GROUP BY ALL
        )
        SELECT e.cell_l2, e.year, e.month, e.period, e.a, e.v,
               e.a::DOUBLE                                 AS raw_aqua,
               e.a * g.ratio                               AS global_ratio,
               greatest(0, g.slope * e.a + g.intercept)    AS ols,
               CASE WHEN e.a = 0 THEN 0 ELSE e.a * mp.ratio END AS month_period_ratio,
               CASE WHEN e.a = 0 THEN 0 ELSE e.a * coalesce(f.f, r.r_region) END AS f_pooled,
               -- a cell outside the calibration universe gets no background (see calibration.apply_factors)
               CASE WHEN e.a > 0 THEN e.a * coalesce(f.f, r.r_region)
                    WHEN f.cell_l2 IS NULL THEN 0 ELSE f.b END AS f_pooled_static_background,
               CASE WHEN e.a > 0 THEN e.a * coalesce(f.f, r.r_region)
                    WHEN f.cell_l2 IS NULL THEN 0 ELSE {background} END AS f_pooled_background
        FROM {eval_rows} e
        CROSS JOIN g
        LEFT JOIN mp USING (month, period)
        LEFT JOIN region r USING (month, period)
        LEFT JOIN {factors} f USING (cell_l2, month, period)
        """
    )
    return name


def high_season_months(con: duckdb.DuckDBPyConnection, panel: str, n: int = 4) -> list[int]:
    """The `n` months of the year with the most reference detections in the calibration years."""
    rows = con.execute(
        f"SELECT month FROM {panel} GROUP BY month ORDER BY sum(v) DESC, month LIMIT {int(n)}"
    ).fetchall()
    return sorted(r[0] for r in rows)


def score(
    con: duckdb.DuckDBPyConnection, predictions: str, *, season_months: Sequence[int] = ()
) -> list[dict]:
    """Error of every method. One dict per method × level × split.

    Levels: `cell_month` (one row per cell, month and day/night) and `region_month` (cells summed first,
    day + night). Splits: all, period, year, Aqua = 0 vs Aqua > 0, and high vs low season.
    """
    months = ", ".join(str(int(m)) for m in season_months) or "NULL"
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE _long AS
        SELECT cell_l2, year, month, period, a, v, method, pred,
               CASE WHEN month IN ({months}) THEN 'high' ELSE 'low' END AS season,
               CASE WHEN a = 0 THEN 'zero' ELSE 'positive' END AS aqua
        FROM {predictions} UNPIVOT INCLUDE NULLS (pred FOR method IN ({_KEYS}))
        """
    )
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE _region AS
        SELECT year, month, period, season, method, sum(v) AS v,
               CASE WHEN count(pred) = count(*) THEN sum(pred) END AS pred
        FROM _long GROUP BY ALL
        """
    )
    # A regional total exists only when every part of it has a prediction.
    total = "sum(v) AS v, CASE WHEN count(pred) = count(*) THEN sum(pred) END AS pred FROM _region"
    queries = [
        ("cell_month", "all", "'all'", "_long"),
        ("cell_month", "period", "period", "_long"),
        ("cell_month", "year", "year::VARCHAR", "_long"),
        ("cell_month", "aqua", "aqua", "_long"),
        ("cell_month", "season", "season", "_long"),
        ("region_month", "period", "period", "_region"),
        ("region_month", "season", "season", f"(SELECT year, month, season, method, {total} GROUP BY ALL)"),
        ("region_month", "all", "'all'", f"(SELECT year, month, method, {total} GROUP BY ALL)"),
    ]
    out: list[dict] = []
    for level, split, expr, source in queries:
        cur = con.execute(
            f"SELECT method, {expr} AS value, {_METRICS} FROM {source} GROUP BY ALL ORDER BY value, method"
        )
        names = [d[0] for d in cur.description]
        for row in cur.fetchall():
            out.append({"level": level, "split": split, **dict(zip(names, row, strict=True))})
    order = {key: i for i, (key, _, _) in enumerate(METHODS)}
    out.sort(key=lambda s: (s["level"], s["split"], str(s["value"]), order[s["method"]]))
    return out


def _pick(scores: Sequence[dict], level: str, metric: str = "mae") -> dict[str, float]:
    return {s["method"]: s[metric] for s in scores
            if s["level"] == level and s["split"] == "all" and s[metric] is not None}


def regional_difference(
    con: duckdb.DuckDBPyConnection,
    predictions: str,
    baseline: str,
    *,
    resamples: int = 5000,
    seed: int = 20261115,
) -> dict:
    """Paired comparison on regional monthly totals: |error of the final method| − |error of `baseline`|.

    Returns the mean difference over the months and a 90% bootstrap interval (months resampled with
    replacement). Negative means the final method is closer.
    """
    rows = con.execute(
        f"""
        SELECT abs(sum({FINAL}) - sum(v)) - abs(sum({baseline}) - sum(v)) AS d
        FROM {predictions} GROUP BY year, month
        HAVING count({FINAL}) = count(*) AND count({baseline}) = count(*)
        ORDER BY year, month
        """
    ).fetchall()
    diffs = [r[0] for r in rows]
    if not diffs:
        return {"baseline": baseline, "months": 0, "mean": None, "ci90_low": None, "ci90_high": None}
    rng = random.Random(seed)
    n = len(diffs)
    means = sorted(sum(rng.choice(diffs) for _ in range(n)) / n for _ in range(resamples))
    return {
        "baseline": baseline,
        "months": n,
        "final_closer_in_months": sum(d < 0 for d in diffs),
        "mean": sum(diffs) / n,
        "ci90_low": means[int(0.05 * resamples)],
        "ci90_high": means[int(0.95 * resamples) - 1],
    }


RULE = (
    "Pass when (1) the final method has a lower MAE and a lower RMSE than every baseline at cell-month "
    "level, and (2) on regional monthly totals it is not distinguishably worse than the best baseline: "
    "the 90% paired bootstrap interval of the difference in absolute error is not entirely above zero. "
    "If it fails, the best baseline ships and the result is stated. Scored on coverage-adequate months."
)


def best_regional_baseline(scores: Sequence[dict]) -> str:
    region = _pick(scores, "region_month")
    return min(BASELINES, key=lambda b: region[b])


def verdict(scores: Sequence[dict], regional: dict) -> dict:
    """Apply the rule written down before the final test was opened (`RULE`).

    `regional` is `regional_difference` against the best regional baseline. `F` without the background is
    an ablation, not a product option: it leaves out every month where Aqua saw nothing.
    """
    cell_mae, cell_rmse = _pick(scores, "cell_month"), _pick(scores, "cell_month", "rmse")
    region = _pick(scores, "region_month")
    beats_mae = all(cell_mae[FINAL] < cell_mae[b] for b in BASELINES)
    beats_rmse = all(cell_rmse[FINAL] < cell_rmse[b] for b in BASELINES)
    strictly_better = all(region[FINAL] < region[b] for b in BASELINES)
    not_worse = regional["ci90_low"] is not None and regional["ci90_low"] <= 0
    accepted = beats_mae and beats_rmse and not_worse
    best_cell = min(BASELINES, key=lambda b: cell_mae[b])
    return {
        "final_method": FINAL,
        "cell_month_lower_mae_than_every_baseline": beats_mae,
        "cell_month_lower_rmse_than_every_baseline": beats_rmse,
        "region_month_lower_mae_than_every_baseline": strictly_better,
        "region_month_not_distinguishably_worse": not_worse,
        "regional_difference": regional,
        "accepted": accepted,
        "best_baseline_cell_month_mae": best_cell,
        "best_baseline_region_month_mae": regional["baseline"],
        "ship": FINAL if accepted else (regional["baseline"] if not not_worse else best_cell),
        "rule": RULE,
    }


def markdown_table(scores: Sequence[dict], *, title: str) -> str:
    """The table for the repo and the app's "About the method" panel."""
    def row_for(method: str, level: str) -> dict:
        return next(
            s for s in scores if s["method"] == method and s["level"] == level and s["split"] == "all"
        )

    def fmt(value: float | None, pattern: str) -> str:
        return "n/a" if value is None else format(value, pattern)

    lines = [
        f"### {title}",
        "",
        "| Method | Role | MAE, cell-month | RMSE, cell-month | Bias | Correlation "
        "| MAE, regional month | Bias, regional |",
        "|---|---|---:|---:|---:|---:|---:|---:|",
    ]
    for key, label, role in METHODS:
        c, r = row_for(key, "cell_month"), row_for(key, "region_month")
        lines.append(
            f"| {label} | {role} | {fmt(c['mae'], '.2f')} | {fmt(c['rmse'], '.2f')} | "
            f"{fmt(c['bias_rel'], '+.1%')} | {fmt(c['corr'], '.3f')} | {fmt(r['mae'], '.1f')} | "
            f"{fmt(r['bias_rel'], '+.1%')} |"
        )
    return "\n".join(lines) + "\n"
