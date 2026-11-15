"""Calendar data access (task D2): read `calendar/v1`, sum the cells of an area, add median and anomalies.

The data contract is docs/data-dictionary.md. The rules this module applies:

* Sum `count_harmonized` over the cells of the area first, then compute the median and the anomalies on the
  sum. Per-cell anomalies are never averaged.
* An area is the set of 0.25 degree cells that overlap the box (cells that only touch its edge are out). A box
  smaller than a cell therefore selects that cell, and the box of the whole pilot extent selects every cell.
* A month with no row anywhere in the extent has no data. A month with rows elsewhere in the extent counts as
  zero detections for cells of the area that have no row: an absent row means no detection by the source
  satellite (it does not prove there was no fire).
* The 90% interval of an area is approximate: errors of neighboring cells move together, so the summed
  variance is widened by `n_cells ** 0.32` (docs/methodology.md, "Sums of cells"). One cell is not widened.
* Nothing becomes zero by accident: an interval without the variance of every contributing cell stays `None`.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from pathlib import Path

import duckdb

CELL_SIZE_DEG = 0.25
PERIODS = ("ALL", "D", "N")
# 90% interval of an area: Z_90 * sqrt(sum(var) * n_cells ** CORRELATION_EXPONENT). Adding the variances
# alone assumes independent cells and understates the error of a sum (2.4x for 16 cells, 13.7x for the
# whole extent); the exponent is the fit in docs/methodology.md and docs/data-dictionary.md.
Z_90 = 1.645
CORRELATION_EXPONENT = 0.32
MAD_TO_SIGMA = 1.4826
# A median over fewer years than this is not shown.
MIN_BASELINE_YEARS = 3


# A cell [lat_min, lat_min + size] x [lon_min, lon_min + size] overlaps the box if the intervals overlap
# on both axes (edges that only touch do not count).
_OVERLAP_SQL = "lat_min < ? AND lat_min + ? > ? AND lon_min < ? AND lon_min + ? > ?"


@dataclass(frozen=True)
class Bounds:
    west: float
    south: float
    east: float
    north: float

    def overlap_params(self) -> list[float]:
        return [self.north, CELL_SIZE_DEG, self.south, self.east, CELL_SIZE_DEG, self.west]


@dataclass(frozen=True)
class MonthRow:
    year: int
    month: int
    count_harmonized: float
    ci_low: float | None
    ci_high: float | None
    is_estimated: bool
    is_partial: bool
    days_observed: int
    origin: str
    source_satellite: str
    median_hist: float | None = None
    anomaly_abs: float | None = None
    anomaly_pct: float | None = None
    anomaly_z: float | None = None


@dataclass(frozen=True)
class AreaCalendar:
    bounds: Bounds
    cells: int
    period: str
    model_version: str
    baseline_years: tuple[int, int] | None
    first_year: int
    last_year: int
    months: list[MonthRow]


class NoCellsInArea(ValueError):
    """The box overlaps no cell of the calendar."""


class CalendarStore:
    """`calendar/v1` loaded once into memory (only the columns the app needs), queried per request."""

    def __init__(self, parquet_glob: str) -> None:
        self._con = duckdb.connect()
        self._con.execute(
            """
            CREATE TABLE cal AS
            SELECT cell_l2, year::INTEGER AS year, month::INTEGER AS month, period,
                   count_harmonized, var_harmonized, is_estimated, is_partial,
                   days_observed::INTEGER AS days_observed, origin, source_satellite, model_version
            FROM read_parquet(?, hive_partitioning = true)
            """,
            [parquet_glob],
        )
        self._con.execute(
            """
            CREATE TABLE cells AS
            SELECT cell_l2, any_value(lat_min) AS lat_min, any_value(lon_min) AS lon_min
            FROM read_parquet(?, hive_partitioning = true) GROUP BY cell_l2
            """,
            [parquet_glob],
        )
        # One row per month and period for the whole extent: tells "no data" apart from "zero detections".
        self._con.execute(
            """
            CREATE TABLE coverage AS
            SELECT year, month, period,
                   bool_or(is_estimated) AS is_estimated, bool_or(is_partial) AS is_partial,
                   max(days_observed) AS days_observed,
                   min(origin) AS origin, min(source_satellite) AS source_satellite
            FROM cal GROUP BY year, month, period
            """
        )
        versions = self._con.execute("SELECT DISTINCT model_version FROM cal ORDER BY 1").fetchall()
        self.model_version = ",".join(v[0] for v in versions if v[0])
        row = self._con.execute("SELECT count(*), min(year), max(year) FROM cal").fetchone()
        assert row is not None
        self.rows, self.first_year, self.last_year = row
        if not self.rows:
            raise ValueError(f"No calendar rows under {parquet_glob}")

    @classmethod
    def from_data_root(cls, data_root: str | Path, dataset_version: str = "v1") -> CalendarStore:
        folder = Path(data_root) / "processed" / "calendar" / dataset_version
        files = list(folder.glob("**/*.parquet"))
        if not files:
            raise FileNotFoundError(f"No calendar Parquet files under {folder}")
        return cls(str(folder / "**" / "*.parquet"))

    def area_calendar(
        self,
        bounds: Bounds,
        period: str = "ALL",
        baseline: tuple[int, int] | None = None,
    ) -> AreaCalendar:
        if period not in PERIODS:
            raise ValueError(f"period must be one of {PERIODS}")
        cursor = self._con.cursor()  # one cursor per request: connections are not shared between threads
        n_cells = cursor.execute(
            f"SELECT count(*) FROM cells WHERE {_OVERLAP_SQL}", bounds.overlap_params()
        ).fetchone()
        cells = int(n_cells[0]) if n_cells else 0
        if cells == 0:
            raise NoCellsInArea("The selected area overlaps no 0.25 degree cell of the calendar.")

        rows = cursor.execute(
            f"""
            WITH sel AS (
                SELECT cell_l2 FROM cells WHERE {_OVERLAP_SQL}
            ), sums AS (
                SELECT year, month, sum(count_harmonized) AS total, sum(var_harmonized) AS var_sum,
                       count(var_harmonized) AS n_var, count(*) AS n_rows
                FROM cal WHERE period = ? AND cell_l2 IN (SELECT cell_l2 FROM sel)
                GROUP BY year, month
            )
            SELECT c.year, c.month, coalesce(s.total, 0.0), s.var_sum,
                   coalesce(s.n_var, 0), coalesce(s.n_rows, 0),
                   c.is_estimated, c.is_partial, c.days_observed, c.origin, c.source_satellite
            FROM coverage c LEFT JOIN sums s USING (year, month)
            WHERE c.period = ? ORDER BY c.year, c.month
            """,
            [*bounds.overlap_params(), period, period],
        ).fetchall()

        months = [_month_row(*r, cells=cells) for r in rows]
        used_baseline = baseline or _default_baseline(months)
        months = _with_anomalies(months, used_baseline)
        return AreaCalendar(
            bounds=bounds,
            cells=cells,
            period=period,
            model_version=self.model_version,
            baseline_years=used_baseline,
            first_year=self.first_year,
            last_year=self.last_year,
            months=months,
        )


def _month_row(
    year: int,
    month: int,
    total: float,
    var_sum: float | None,
    n_var: int,
    n_rows: int,
    is_estimated: bool,
    is_partial: bool,
    days_observed: int,
    origin: str,
    source_satellite: str,
    *,
    cells: int,
) -> MonthRow:
    ci_low: float | None = None
    ci_high: float | None = None
    # An interval needs the variance of every cell that contributed; without it the interval stays None
    # ("interval pending"), never zero. Observed months have no variance.
    if n_rows == 0 and not is_estimated:
        ci_low, ci_high = total, total
    elif n_rows > 0 and n_var == n_rows and var_sum is not None:
        var_area = max(var_sum, 0.0) * cells**CORRELATION_EXPONENT
        spread = Z_90 * math.sqrt(var_area)
        ci_low, ci_high = max(0.0, total - spread), total + spread
    return MonthRow(
        year=year,
        month=month,
        count_harmonized=round(total, 3),
        ci_low=None if ci_low is None else round(ci_low, 3),
        ci_high=None if ci_high is None else round(ci_high, 3),
        is_estimated=bool(is_estimated),
        is_partial=bool(is_partial),
        days_observed=int(days_observed),
        origin=origin,
        source_satellite=source_satellite,
    )


def _default_baseline(months: list[MonthRow]) -> tuple[int, int] | None:
    complete = [m.year for m in months if not m.is_partial]
    return (min(complete), max(complete)) if complete else None


def _with_anomalies(months: list[MonthRow], baseline: tuple[int, int] | None) -> list[MonthRow]:
    """Median, absolute and percent anomaly and robust z of the area sum, per month of the year.

    The baseline is the complete (not partial) months of the baseline years. A partial month gets no anomaly:
    comparing it with full months would read an incomplete month as "little activity".
    """
    if baseline is None:
        return months
    start, end = baseline
    by_month: dict[int, list[float]] = {}
    for m in months:
        if not m.is_partial and start <= m.year <= end:
            by_month.setdefault(m.month, []).append(m.count_harmonized)
    stats: dict[int, tuple[float, float]] = {}
    for month, values in by_month.items():
        if len(values) < MIN_BASELINE_YEARS:
            continue
        median = statistics.median(values)
        mad = statistics.median(abs(v - median) for v in values)
        stats[month] = (median, mad)

    out: list[MonthRow] = []
    for m in months:
        found = stats.get(m.month)
        if found is None:
            out.append(m)
            continue
        median, mad = found
        if m.is_partial:
            out.append(_replace(m, median_hist=round(median, 3)))
            continue
        diff = m.count_harmonized - median
        out.append(
            _replace(
                m,
                median_hist=round(median, 3),
                anomaly_abs=round(diff, 3),
                anomaly_pct=round(diff / median * 100, 1) if median > 0 else None,
                anomaly_z=round(diff / (MAD_TO_SIGMA * mad), 2) if mad > 0 else None,
            )
        )
    return out


def _replace(row: MonthRow, **changes: float | None) -> MonthRow:
    return MonthRow(**{**row.__dict__, **changes})
