"""One month of ERA5 on the 3 degree lattice of the live field, for a past month picked in the calendar.

The overview draws the hotspots of the month picked in the calendar. For the current month the weather is
the live field (weather_live.py). For any other month the weather must be of that month, so it comes from
the Open-Meteo Historical API with `models=era5` (never `best_match`, which can mix models across decades),
on the SAME lattice as the live field: the temperature surface, the wind streaks and the "Region weather"
panel read one lattice either way.

What a month field is (and is not):

* `temperature_c` is the mean of the daily mean 2 m temperatures of the month.
* `wind_speed_kmh` is the mean of the daily mean 10 m wind speeds. `wind_from_deg` is where the wind blows
  FROM, taken from the mean wind vector of the month, and `wind_flow_kmh` is the length of that mean vector:
  the **mean flow** of the month. It is not the circulation at any instant, and it is smaller than the mean
  speed unless the wind never changed direction. The animation uses the mean flow and says so.
* Days are UTC days. ERA5 is published a few days late, so for a month that has just ended or is not over,
  the last days are missing: they are left out and reported in `days_available`, never filled.

Cost and storage: every location of a request counts as one call at the service (a month of one location
costs one call), so one new month is 238 calls. A month that ended more than 60 days ago never changes and
is kept for good; a recent one is kept 6 hours. Months are written to the cache folder
(`ASTRO_WEATHER_CACHE`), so a restart or a second visitor does not ask again; there is a daily budget;
concurrent requests for the same month share one set of calls; and a 429 from the service is retried with a
growing pause.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from astro_dashboard.weather import (
    GRID_CHUNK,
    RECENT_DAYS,
    RECENT_TTL_SECONDS,
    Fetcher,
    RateLimited,
    WeatherUnavailable,
    _month_bounds,
    fetch_open_meteo,
    summarize,
)
from astro_dashboard.weather_live import LIVE_REGION, LIVE_STEP_DEG, live_points

log = logging.getLogger("astro_dashboard")

SOURCE = "Open-Meteo Historical Weather API, ERA5 reanalysis (Copernicus Climate Change Service / ECMWF)"
MODEL = "era5"
MONTH_DAILY_BUDGET = 2500  # locations asked per UTC day: ten new months; the free limit is 10,000 calls
RETRY_PAUSES_SECONDS = (2.0, 5.0, 12.0)  # after a 429, with a growing pause


@dataclass(frozen=True)
class MonthPoint:
    lat: float
    lon: float
    temperature_c: float | None
    wind_speed_kmh: float | None
    # Where the wind blows FROM, of the mean wind vector of the month; None when the winds cancel.
    wind_from_deg: float | None
    # The length of that mean vector (km/h): the mean flow of the month.
    wind_flow_kmh: float | None
    days_available: int


@dataclass(frozen=True)
class MonthField:
    year: int
    month: int
    start: date
    end: date
    available_through: date | None
    days_requested: int
    step_deg: float
    points: list[MonthPoint]


class MonthBudgetSpent(WeatherUnavailable):
    """The day's calls for historical weather are spent: a month not yet stored waits until tomorrow."""


class MonthFieldService:
    def __init__(
        self,
        fetch: Fetcher = fetch_open_meteo,
        clock: Callable[[], float] = time.time,
        cache_dir: Path | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._fetch = fetch
        self._clock = clock
        self._cache_dir = cache_dir
        self._sleep = sleep
        self._lock = threading.Lock()
        self._locks: dict[tuple[int, int], threading.Lock] = {}
        self._memory: dict[tuple[int, int], tuple[float | None, MonthField]] = {}
        self._spent_day: str | None = None
        self._spent = 0
        self._budget_loaded = cache_dir is None

    # ---- public --------------------------------------------------------------------------------------

    def month_field(self, year: int, month: int, today: date | None = None) -> MonthField:
        today = today or datetime.fromtimestamp(self._clock(), tz=UTC).date()
        start, end = _month_bounds(
            year, month, today
        )  # raises WeatherOutOfRange for a month ERA5 cannot have
        key = (year, month)
        with self._lock:
            gate = self._locks.setdefault(key, threading.Lock())
        with gate:  # concurrent requests for the same month wait here and then read what the first one stored
            cached = self._read(key)
            if cached is not None:
                return cached
            return self._ask(key, start, end, today)

    # ---- asking the service --------------------------------------------------------------------------

    def _ask(self, key: tuple[int, int], start: date, end: date, today: date) -> MonthField:
        points = live_points()
        self._charge(len(points))
        n_days = (end - start).days + 1
        daily = self._fetch_chunks(points, start, end)
        out: list[MonthPoint] = []
        last_day = -1
        for (lat, lon), one in zip(points, daily, strict=True):
            summary = summarize([one], start, end, key[0], key[1], 1)
            speed, steadiness = summary.wind_speed_mean_kmh, summary.wind_direction_steadiness
            flow = None if speed is None or steadiness is None else round(speed * steadiness, 1)
            out.append(
                MonthPoint(
                    lat=lat,
                    lon=lon,
                    temperature_c=summary.temperature_mean_c,
                    wind_speed_kmh=speed,
                    wind_from_deg=summary.wind_direction_from_deg,
                    wind_flow_kmh=flow,
                    days_available=summary.days_available,
                )
            )
            if summary.available_through is not None:
                last_day = max(last_day, (summary.available_through - start).days)
        field = MonthField(
            year=key[0],
            month=key[1],
            start=start,
            end=end,
            available_through=start + timedelta(days=last_day) if last_day >= 0 else None,
            days_requested=n_days,
            step_deg=LIVE_STEP_DEG,
            points=out,
        )
        settled = (today - end).days > RECENT_DAYS
        expires = None if settled else self._clock() + RECENT_TTL_SECONDS
        with self._lock:
            self._memory[key] = (expires, field)
        self._write(key, expires, field)
        return field

    def _fetch_chunks(self, points: list, start: date, end: date) -> list[dict]:
        daily: list[dict] = []
        for i in range(0, len(points), GRID_CHUNK):
            chunk = points[i : i + GRID_CHUNK]
            for pause in (*RETRY_PAUSES_SECONDS, None):
                try:
                    daily.extend(self._fetch(chunk, start, end))
                    break
                except RateLimited:
                    if pause is None:
                        raise  # the service keeps refusing: say so, never invent the month
                    self._sleep(pause)
        return daily

    # ---- the day's budget -----------------------------------------------------------------------------

    def _charge(self, locations: int) -> None:
        with self._lock:
            if not self._budget_loaded:
                self._load_budget()
            day = datetime.fromtimestamp(self._clock(), tz=UTC).strftime("%Y-%m-%d")
            if self._spent_day != day:
                self._spent_day, self._spent = day, 0
            if self._spent + locations > MONTH_DAILY_BUDGET:
                raise MonthBudgetSpent(
                    "The daily budget of calls for historical weather is spent: this month is not stored yet."
                )
            self._spent += locations  # counted before the calls: a failed call may still count at the service
            self._write_file("era5-budget.json", {"day": self._spent_day, "spent": self._spent})

    def _load_budget(self) -> None:
        self._budget_loaded = True
        path = self._path("era5-budget.json")
        try:
            if path is not None and path.exists():
                raw = json.loads(path.read_text())
                self._spent_day, self._spent = raw["day"], int(raw["spent"])
        except (OSError, ValueError, KeyError, TypeError) as error:
            log.warning("Ignoring an unreadable historical weather budget: %s", error)

    # ---- memory and disk -----------------------------------------------------------------------------

    def _path(self, name: str) -> Path | None:
        return None if self._cache_dir is None else self._cache_dir / name

    def _write_file(self, name: str, payload: dict) -> None:
        path = self._path(name)
        if path is None:
            return
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".tmp")
            temporary.write_text(json.dumps(payload))
            temporary.replace(path)  # atomic: a reader never sees half a file
        except OSError as error:
            log.warning("Could not write the historical weather cache %s: %s", name, error)

    def _write(self, key: tuple[int, int], expires: float | None, field: MonthField) -> None:
        self._write_file(
            f"era5-{key[0]}-{key[1]:02d}.json",
            {
                "expires": expires,
                "step_deg": field.step_deg,
                "region": asdict(LIVE_REGION),
                "year": field.year,
                "month": field.month,
                "start": field.start.isoformat(),
                "end": field.end.isoformat(),
                "available_through": None
                if field.available_through is None
                else field.available_through.isoformat(),
                "days_requested": field.days_requested,
                "points": [asdict(p) for p in field.points],
            },
        )

    def _read(self, key: tuple[int, int]) -> MonthField | None:
        now = self._clock()
        with self._lock:
            hit = self._memory.get(key)
        if hit and (hit[0] is None or hit[0] > now):
            return hit[1]
        path = self._path(f"era5-{key[0]}-{key[1]:02d}.json")
        if path is None or not path.exists():
            return None
        try:
            raw = json.loads(path.read_text())
            if raw["step_deg"] != LIVE_STEP_DEG:  # another lattice is not this field
                return None
            if raw["expires"] is not None and raw["expires"] <= now:
                return None
            through = raw["available_through"]
            field = MonthField(
                year=raw["year"],
                month=raw["month"],
                start=date.fromisoformat(raw["start"]),
                end=date.fromisoformat(raw["end"]),
                available_through=None if through is None else date.fromisoformat(through),
                days_requested=raw["days_requested"],
                step_deg=raw["step_deg"],
                points=[MonthPoint(**p) for p in raw["points"]],
            )
        except (OSError, ValueError, KeyError, TypeError) as error:
            log.warning("Ignoring an unreadable historical weather file: %s", error)
            return None
        with self._lock:
            self._memory[key] = (raw["expires"], field)
        return field
