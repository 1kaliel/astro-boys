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
* Nothing becomes zero by accident: an interval without the variance of every contributing cell stays `None`,
  and so does the count of a month in which a contributing cell (or the whole extent) has no estimate, as in
  the estimated partial months of 2002.
* The unfinished month is compared with the same days of earlier years, from `month_to_date/v1` (days 1..N of
  that month, summed over the area per year; a year with no row in the area counts as zero). A partial month
  never gets the full-month median: without that table it has no median and no anomaly.
* Raw counts stay per satellite (`raw_aqua`, `raw_terra`, `raw_snpp`, `raw_n20`, each summed over the area):
  they are never added together, and null means the satellite had no data in that month. `raw_source` is the
  native count of the month's source satellite, the number a chart of raw counts would show.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from pathlib import Path

import duckdb

CELL_SIZE_DEG = 0.25
PERIODS = ("ALL", "D", "N")
# Native filtered counts per satellite (docs/data-dictionary.md).
RAW_COLUMNS = ("raw_aqua", "raw_terra", "raw_snpp", "raw_n20")
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
    count_harmonized: float | None
    ci_low: float | None
    ci_high: float | None
    is_estimated: bool
    is_partial: bool
    days_observed: int
    origin: str
    source_satellite: str
    median_hist: float | None = None
    # Years the median is taken over, and the days it covers: None = whole months, N = days 1..N of the month.
    median_n_years: int | None = None
    median_days: int | None = None
    # Native counts per satellite, summed over the area; None = the satellite had no data in that month.
    raw_aqua: int | None = None
    raw_terra: int | None = None
    raw_snpp: int | None = None
    raw_n20: int | None = None
    # Native count of the month's source satellite (not harmonized, not comparable between MODIS and VIIRS).
    raw_source: int | None = None
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

    def __init__(self, parquet_glob: str, to_date_glob: str | None = None) -> None:
        self._con = duckdb.connect()
        present = {
            r[0]
            for r in self._con.execute(
                "DESCRIBE SELECT * FROM read_parquet(?, hive_partitioning = true, union_by_name = true)",
                [parquet_glob],
            ).fetchall()
        }
        # A calendar without the raw columns (old fixtures) still loads: its raw counts are null.
        raw = ", ".join(
            f"{c}::INTEGER AS {c}" if c in present else f"NULL::INTEGER AS {c}" for c in RAW_COLUMNS
        )
        self._con.execute(
            f"""
            CREATE TABLE cal AS
            SELECT cell_l2, year::INTEGER AS year, month::INTEGER AS month, period,
                   count_harmonized, var_harmonized, is_estimated, is_partial,
                   days_observed::INTEGER AS days_observed, origin, source_satellite, model_version, {raw}
            FROM read_parquet(?, hive_partitioning = true, union_by_name = true)
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
                   min(origin) AS origin, min(source_satellite) AS source_satellite,
                   count(count_harmonized) > 0 AS has_count,
                   count(raw_aqua) > 0 AS has_aqua, count(raw_terra) > 0 AS has_terra,
                   count(raw_snpp) > 0 AS has_snpp, count(raw_n20) > 0 AS has_n20
            FROM cal GROUP BY year, month, period
            """
        )
        # Same days of earlier years for the unfinished month. The table holds D and N; ALL is their sum.
        self._con.execute(
            """
            CREATE TABLE to_date (cell_l2 VARCHAR, year INTEGER, month INTEGER, period VARCHAR,
                                  days INTEGER, n_hotspots DOUBLE, n_years INTEGER)
            """
        )
        if to_date_glob is not None:
            self._con.execute(
                """
                INSERT INTO to_date
                SELECT cell_l2, year::INTEGER, month::INTEGER, period, days::INTEGER, n_hotspots::DOUBLE,
                       n_years::INTEGER
                FROM read_parquet(?) WHERE period IN ('D', 'N')
                """,
                [to_date_glob],
            )
        # (month, days) -> (the years with a row anywhere in the extent, the number of years of the table)
        self._to_date_windows: dict[tuple[int, int], tuple[list[int], int]] = {
            (month, days): (sorted(years), n_years)
            for month, days, years, n_years in self._con.execute(
                "SELECT month, days, list(DISTINCT year), max(n_years) FROM to_date GROUP BY month, days"
            ).fetchall()
        }
        self.to_date_rows = int(self._con.execute("SELECT count(*) FROM to_date").fetchone()[0])  # type: ignore[index]
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
        to_date = Path(data_root) / "processed" / "month_to_date" / dataset_version
        has_to_date = any(to_date.glob("**/*.parquet"))
        return cls(
            str(folder / "**" / "*.parquet"), str(to_date / "**" / "*.parquet") if has_to_date else None
        )

    def to_date_windows(self) -> list[dict[str, int]]:
        """What `month_to_date` covers: days 1..`days` of `month`, in `n_years` earlier years."""
        return [
            {"month": month, "days": days, "n_years": n_years, "last_year": max(years)}
            for (month, days), (years, n_years) in sorted(self._to_date_windows.items())
        ]

    def unfinished_month(self) -> tuple[int, int, int] | None:
        """(year, month, days observed) of the last month of the data if it is observed and partial."""
        row = self._con.execute(
            """
            SELECT year, month, max(days_observed), bool_or(is_partial AND NOT is_estimated)
            FROM coverage GROUP BY year, month ORDER BY year DESC, month DESC LIMIT 1
            """
        ).fetchone()
        return (int(row[0]), int(row[1]), int(row[2])) if row and row[3] else None

    def source_satellite(self, year: int, month: int, period: str = "ALL") -> str | None:
        """The month's source satellite (`Aqua`, `Terra`, `SNPP`, `N20`), the one `raw_source` counts; None if
        the calendar has no row for that month and period anywhere in the extent."""
        row = (
            self._con.cursor()
            .execute(
                "SELECT source_satellite FROM coverage WHERE year = ? AND month = ? AND period = ?",
                [year, month, period],
            )
            .fetchone()
        )
        return row[0] if row else None

    def cells_in(self, bounds: Bounds) -> tuple[str, ...]:
        """The 0.25 degree cells that overlap the box (the area rule of the calendar), sorted.

        The CSV download (D6) uses the same cells, so its rows add up to the counts behind the calendar."""
        cursor = self._con.cursor()
        rows = cursor.execute(
            f"SELECT cell_l2 FROM cells WHERE {_OVERLAP_SQL} ORDER BY 1", bounds.overlap_params()
        ).fetchall()
        return tuple(r[0] for r in rows)

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
                       count(var_harmonized) AS n_var, count(*) AS n_rows,
                       count(count_harmonized) AS n_count,
                       sum(raw_aqua) AS aqua, sum(raw_terra) AS terra, sum(raw_snpp) AS snpp,
                       sum(raw_n20) AS n20
                FROM cal WHERE period = ? AND cell_l2 IN (SELECT cell_l2 FROM sel)
                GROUP BY year, month
            )
            SELECT c.year, c.month,
                   -- No estimate in the month (nowhere in the extent, or not for a cell of the area) is not
                   -- zero. A cell without a row in a month that has counts had no detection: that is zero.
                   CASE WHEN c.has_count AND coalesce(s.n_count, 0) = coalesce(s.n_rows, 0)
                        THEN coalesce(s.total, 0.0) END,
                   s.var_sum, coalesce(s.n_var, 0), coalesce(s.n_rows, 0),
                   c.is_estimated, c.is_partial, c.days_observed, c.origin, c.source_satellite,
                   -- Per satellite: null if it had no data anywhere in the extent that month; a cell of the
                   -- area without a value had no detection by it (zero).
                   CASE WHEN c.has_aqua THEN coalesce(s.aqua, 0) END,
                   CASE WHEN c.has_terra THEN coalesce(s.terra, 0) END,
                   CASE WHEN c.has_snpp THEN coalesce(s.snpp, 0) END,
                   CASE WHEN c.has_n20 THEN coalesce(s.n20, 0) END
            FROM coverage c LEFT JOIN sums s USING (year, month)
            WHERE c.period = ? ORDER BY c.year, c.month
            """,
            [*bounds.overlap_params(), period, period],
        ).fetchall()

        months = [_month_row(*r, cells=cells) for r in rows]
        used_baseline = baseline or _default_baseline(months)
        months = _with_anomalies(months, used_baseline)
        months = [
            self._same_days(cursor, m, bounds, period, used_baseline) if m.is_partial else m for m in months
        ]
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


    def _same_days(
        self,
        cursor: duckdb.DuckDBPyConnection,
        row: MonthRow,
        bounds: Bounds,
        period: str,
        baseline: tuple[int, int] | None,
    ) -> MonthRow:
        """Median and anomalies of a partial month against the same days of earlier years, when
        `month_to_date` covers exactly those days. Estimated months are not in that table: it counts VIIRS."""
        window = self._to_date_windows.get((row.month, row.days_observed))
        if window is None or row.is_estimated:
            return row
        all_years, n_years = window
        years = [
            y for y in all_years if y < row.year and (baseline is None or baseline[0] <= y <= baseline[1])
        ]
        if not years or max(all_years) >= row.year:
            return row
        sums = dict(
            cursor.execute(
                f"""
                SELECT year, sum(n_hotspots) FROM to_date
                WHERE month = ? AND days = ? AND (? = 'ALL' OR period = ?)
                  AND cell_l2 IN (SELECT cell_l2 FROM cells WHERE {_OVERLAP_SQL})
                GROUP BY year
                """,
                [row.month, row.days_observed, period, period, *bounds.overlap_params()],
            ).fetchall()
        )
        # A year without a row in the area had no detection on those days: zero. So did a year of the table
        # (`n_years`) with no row anywhere in the extent.
        values = [float(sums.get(y, 0.0)) for y in years] + [0.0] * max(0, n_years - len(all_years))
        if len(values) < MIN_BASELINE_YEARS:
            return row
        return _scored(row, values, days=row.days_observed)


def _month_row(
    year: int,
    month: int,
    total: float | None,
    var_sum: float | None,
    n_var: int,
    n_rows: int,
    is_estimated: bool,
    is_partial: bool,
    days_observed: int,
    origin: str,
    source_satellite: str,
    raw_aqua: int | None,
    raw_terra: int | None,
    raw_snpp: int | None,
    raw_n20: int | None,
    *,
    cells: int,
) -> MonthRow:
    ci_low: float | None = None
    ci_high: float | None = None
    # An interval needs the variance of every cell that contributed; without it the interval stays None
    # ("interval pending"), never zero. Observed months have no variance.
    if total is None:
        pass
    elif n_rows == 0 and not is_estimated:
        ci_low, ci_high = total, total
    elif n_rows > 0 and n_var == n_rows and var_sum is not None:
        var_area = max(var_sum, 0.0) * cells**CORRELATION_EXPONENT
        spread = Z_90 * math.sqrt(var_area)
        ci_low, ci_high = max(0.0, total - spread), total + spread
    return MonthRow(
        year=year,
        month=month,
        count_harmonized=None if total is None else round(total, 3),
        ci_low=None if ci_low is None else round(ci_low, 3),
        ci_high=None if ci_high is None else round(ci_high, 3),
        is_estimated=bool(is_estimated),
        is_partial=bool(is_partial),
        days_observed=int(days_observed),
        origin=origin,
        source_satellite=source_satellite,
        raw_aqua=_int(raw_aqua),
        raw_terra=_int(raw_terra),
        raw_snpp=_int(raw_snpp),
        raw_n20=_int(raw_n20),
        raw_source=_int(
            {"Aqua": raw_aqua, "Terra": raw_terra, "SNPP": raw_snpp, "N20": raw_n20}.get(source_satellite)
        ),
    )


def _int(value: float | None) -> int | None:
    return None if value is None else int(value)


def _default_baseline(months: list[MonthRow]) -> tuple[int, int] | None:
    complete = [m.year for m in months if not m.is_partial]
    return (min(complete), max(complete)) if complete else None


def _with_anomalies(months: list[MonthRow], baseline: tuple[int, int] | None) -> list[MonthRow]:
    """Median, absolute and percent anomaly and robust z of the area sum, per month of the year.

    The baseline is the complete (not partial) months of the baseline years that have a count. A partial month
    gets nothing here: comparing it with full months would read an incomplete month as "little activity"
    (see `CalendarStore._same_days`).
    """
    if baseline is None:
        return months
    start, end = baseline
    by_month: dict[int, list[float]] = {}
    for m in months:
        if not m.is_partial and m.count_harmonized is not None and start <= m.year <= end:
            by_month.setdefault(m.month, []).append(m.count_harmonized)
    return [
        _scored(m, by_month[m.month])
        if not m.is_partial and len(by_month.get(m.month, ())) >= MIN_BASELINE_YEARS
        else m
        for m in months
    ]


def _scored(row: MonthRow, values: list[float], days: int | None = None) -> MonthRow:
    """`row` with the median of `values` and, if it has a count, its anomalies against them."""
    median = statistics.median(values)
    mad = statistics.median(abs(v - median) for v in values)
    scored = _replace(row, median_hist=round(median, 3), median_n_years=len(values), median_days=days)
    if row.count_harmonized is None:
        return scored
    diff = row.count_harmonized - median
    return _replace(
        scored,
        anomaly_abs=round(diff, 3),
        anomaly_pct=round(diff / median * 100, 1) if median > 0 else None,
        anomaly_z=round(diff / (MAD_TO_SIGMA * mad), 2) if mad > 0 else None,
    )


def _replace(row: MonthRow, **changes: float | None) -> MonthRow:
    return MonthRow(**{**row.__dict__, **changes})
