"""Days of one month for an area (`GET /api/daily`): NATIVE detections of one satellite per local solar day,
with the overpasses of that satellite on each day. Read from `processed/hotspots/v1` (hotspots.py).

Rules:

* One satellite (the month's source satellite unless another is asked). Satellites are never added together
  and the days are never harmonized: the harmonized series exists per month only.
* Same rows as the calendar: the area's 0.25 degree cells, local solar date (`date_local`),
  `passes_main_filter`, optional day or night.
* Only the partition of that instrument and local solar year is read. If it is missing the answer is an error
  (HotspotsUnavailable), not zeros.
* A day up to the satellite's last date in that partition is "observed": no row is a valid 0 (no detection,
  not "no fire"). A day after it is "no_data" (count None), never 0.
* Passes: detections of one day sorted by acquisition time; a new pass starts when the gap to the previous
  detection exceeds `PASS_GAP_MINUTES` or day/night changes. Local times are UTC + (area centre
  longitude)/15 h.
"""

from __future__ import annotations

import calendar as _calendar
from dataclasses import dataclass, field
from datetime import date, timedelta

import duckdb

from astro_dashboard import hotspots
from astro_dashboard.drilldown import INSTRUMENTS, _partition_source

PASS_GAP_MINUTES = 20
# Above this many detections in the area and month the passes are left out (the counts stay exact).
MAX_PASS_ROWS = 500_000


class NoSatelliteData(ValueError):
    """The partition of that year has no row of the satellite at all: there is no last date to count up to."""


@dataclass(frozen=True)
class Pass:
    satellite: str
    daynight: str
    start_utc: str
    end_utc: str
    start_local: str
    end_local: str
    count: int


@dataclass(frozen=True)
class Day:
    date: date
    status: str  # "observed" | "no_data"
    count: int | None
    passes: list[Pass] = field(default_factory=list)


@dataclass(frozen=True)
class Daily:
    satellite: str
    instrument: str
    last_date: date
    days: list[Day]


def _hhmm(epoch_minutes: float) -> str:
    minutes = int(epoch_minutes // 1) % (24 * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def group_passes(
    satellite: str, rows: list[tuple[str, float]], offset_minutes: float
) -> list[Pass]:
    """Overpasses of one day from (daynight, epoch seconds) rows of one satellite."""
    passes: list[Pass] = []
    current: list[tuple[str, float]] = []

    def close() -> None:
        if current:
            start, end = current[0][1] / 60, current[-1][1] / 60
            passes.append(
                Pass(
                    satellite=satellite,
                    daynight=current[0][0],
                    start_utc=_hhmm(start),
                    end_utc=_hhmm(end),
                    start_local=_hhmm(start + offset_minutes),
                    end_local=_hhmm(end + offset_minutes),
                    count=len(current),
                )
            )

    for daynight, seconds in sorted(rows, key=lambda r: r[1]):
        if current and (daynight != current[-1][0] or seconds - current[-1][1] > PASS_GAP_MINUTES * 60):
            close()
            current = []
        current.append((daynight, seconds))
    close()
    return passes


def daily(
    cells: tuple[str, ...] | list[str],
    year: int,
    month: int,
    satellite: str,
    period: str = "ALL",
    center_lon: float = 0.0,
    root: str | None = None,
) -> Daily:
    """Native detections of `satellite` per local solar day of one month in `cells`, with its passes."""
    instrument = INSTRUMENTS.get(satellite)
    if instrument is None:
        raise ValueError(f"Unknown satellite {satellite!r}")
    root = root or hotspots.hotspots_root()
    first = date(year, month, 1)
    last = date(year, month, _calendar.monthrange(year, month)[1])
    source = _partition_source(root, instrument, year)
    clauses = [
        "date_local BETWEEN ? AND ?",
        "satellite = ?",  # never two satellites, even of the same instrument
        "passes_main_filter",
        "list_contains(?, cell_l2)",
    ]
    params: list = [first, last, satellite, list(cells)]
    if period != "ALL":
        clauses.append("daynight = ?")
        params.append(period)
    where = " AND ".join(clauses)

    con = hotspots._connect(root)
    try:
        last_row = con.execute(
            f"SELECT max(date_local) FROM {source} WHERE satellite = ?", [satellite]
        ).fetchone()
        counts_sql = f"SELECT date_local, count(*) FROM {source} WHERE {where} GROUP BY 1"
        per_day = dict(con.execute(counts_sql, params).fetchall())
        rows: list[tuple[date, str, float]] = []
        if sum(per_day.values()) <= MAX_PASS_ROWS:
            rows = con.execute(
                f"SELECT date_local, daynight, epoch(acq_ts_utc) FROM {source} "
                f"WHERE {where} AND acq_ts_utc IS NOT NULL ORDER BY 3",
                params,
            ).fetchall()
    except duckdb.Error as error:
        raise hotspots.HotspotsUnavailable(f"hotspots/v1 could not be read: {error}") from error
    finally:
        con.close()

    last_date = last_row[0] if last_row else None
    if last_date is None:
        raise NoSatelliteData(f"hotspots/v1 has no {satellite} detection in {year}.")

    per_day_rows: dict[date, list[tuple[str, float]]] = {}
    for day, daynight, seconds in rows:
        per_day_rows.setdefault(day, []).append((daynight, float(seconds)))
    offset = center_lon / 15 * 60

    days: list[Day] = []
    day = first
    while day <= last:
        if day > last_date:
            days.append(Day(date=day, status="no_data", count=None, passes=[]))
        else:
            passes = group_passes(satellite, per_day_rows.get(day, []), offset)
            days.append(Day(date=day, status="observed", count=int(per_day.get(day, 0)), passes=passes))
        day += timedelta(days=1)
    return Daily(satellite=satellite, instrument=instrument, last_date=last_date, days=days)
