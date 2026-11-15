"""Days of one month for an area (`GET /api/daily`): NATIVE detections of one satellite per local solar day,
with the overpasses of that satellite on each day. Read from `processed/hotspots/v1` (hotspots.py).

Rules:

* One satellite (the month's source satellite unless another is asked). Satellites are never added together
  and the days are never harmonized: the harmonized series exists per month only.
* Same rows as the calendar: the area's 0.25 degree cells, local solar date (`date_local`),
  `passes_main_filter`, optional day or night.
* Only the partition of that instrument and local solar year is read. If it is missing the answer is an error
  (HotspotsUnavailable), not zeros.
* A day on which the satellite has at least one row anywhere in that partition (any area, any confidence) is
  "observed": no row in the area is a valid 0 (no detection, not "no fire"). Any other day (before the first
  record, an archive gap, after the last date) is "no_data" (count None), never 0.
* Rows without an acquisition time are counted, and reported as `untimed`, but belong to no pass.
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
    untimed: int = 0  # rows of `count` with no acquisition time (in no pass)


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
    # One read of the partition for the month and satellite (the slow part on gs://), kept in memory; every count
    # and the passes come from it. Only the archive's last date needs a second, two-column read of the year.
    month_filter = ["satellite = ?", "date_local BETWEEN ? AND ?"]
    month_params: list = [satellite, first, last]
    clauses = ["passes_main_filter", "list_contains(?, cell_l2)"]
    params: list = [list(cells)]
    if period != "ALL":
        clauses.append("daynight = ?")
        params.append(period)
    where = " AND ".join(clauses)

    con = hotspots._connect(root)
    try:
        con.execute(
            f"CREATE TEMP TABLE month_rows AS SELECT date_local, daynight, acq_ts_utc, cell_l2, passes_main_filter "
            f"FROM {source} WHERE {' AND '.join(month_filter)}",
            month_params,
        )
        last_row = con.execute(
            f"SELECT max(date_local) FROM {source} WHERE satellite = ?", [satellite]
        ).fetchone()
        # Days of the month on which the satellite recorded anything, anywhere: the others are gaps (no data).
        present = {r[0] for r in con.execute("SELECT DISTINCT date_local FROM month_rows").fetchall()}
        counted = con.execute(
            "SELECT date_local, count(*), count(*) FILTER (WHERE acq_ts_utc IS NULL) "
            f"FROM month_rows WHERE {where} GROUP BY 1",
            params,
        ).fetchall()
        per_day = {r[0]: int(r[1]) for r in counted}
        untimed = {r[0]: int(r[2]) for r in counted}
        rows: list[tuple[date, str, float]] = []
        if sum(per_day.values()) <= MAX_PASS_ROWS:
            rows = con.execute(
                "SELECT date_local, daynight, epoch(acq_ts_utc) FROM month_rows "
                f"WHERE {where} AND acq_ts_utc IS NOT NULL ORDER BY 3",
                params,
            ).fetchall()
    except duckdb.Error as error:
        raise hotspots.HotspotsUnavailable(f"hotspots/v1 could not be read: {error}") from error
    finally:
        con.close()

    archive_last = last_row[0] if last_row else None
    if archive_last is None:
        raise NoSatelliteData(f"hotspots/v1 has no {satellite} detection in {year}.")

    last_date = archive_last
    per_day_rows: dict[date, list[tuple[str, float]]] = {}
    for day, daynight, seconds in rows:
        per_day_rows.setdefault(day, []).append((daynight, float(seconds)))
    offset = center_lon / 15 * 60

    days: list[Day] = []
    day = first
    while day <= last:
        if day not in present:
            days.append(Day(date=day, status="no_data", count=None, passes=[]))
        else:
            passes = group_passes(satellite, per_day_rows.get(day, []), offset)
            days.append(
                Day(
                    date=day,
                    status="observed",
                    count=per_day.get(day, 0),
                    passes=passes,
                    untimed=untimed.get(day, 0),
                )
            )
        day += timedelta(days=1)
    return Daily(satellite=satellite, instrument=instrument, last_date=last_date, days=days)
