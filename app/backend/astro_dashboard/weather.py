"""Weather context from the Open-Meteo Historical API, ERA5 reanalysis (proof of concept).

This is context, not data of the harmonization: it never touches the hotspot counts or the model, and
nothing here
says that weather causes hotspots. ERA5 is a reanalysis (a model fitted to observations), not a station
reading.

How an area is matched to ERA5 (documented in docs/data-dictionary.md, "Weather context"):

* ERA5 values sit on a 0.25 degree grid at multiples of 0.25. The L2 cells of the hotspot grid are also
  0.25 degrees,
  but their edges are on those multiples, so an ERA5 point falls on the corner of four L2 cells, not at a
  cell center.
* The area is the box. Its ERA5 points are the grid points inside the box. No interpolation: a value is
  the value of
  its own grid point. A box too small to hold a point takes the nearest one.
* Ocean points are included (there is no land mask here), and the answer says how many points were used.
* A very large box is sampled on a regular sub-grid of at most `MAX_POINTS` points to keep one request
  small; the
  answer says `points_in_area` and `points_used`.

Days are UTC days. ERA5 is published with a delay of a few days, so the last days of the current month are not
available: the answer says up to which day it has data and never fills the rest.
"""

from __future__ import annotations

import json
import math
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta

from astro_dashboard.calendar import Bounds

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
MODEL = "era5"
ERA5_GRID_DEG = 0.25
FIRST_YEAR = 1940  # where the ERA5 archive starts
MAX_POINTS = 36  # at most 6 x 6 grid points per request
DAILY = ("temperature_2m_mean", "wind_speed_10m_mean", "wind_direction_10m_dominant")
SOURCE = "Open-Meteo Historical Weather API, ERA5 reanalysis (Copernicus Climate Change Service / ECMWF)"
CARDINALS = (
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
)
# A month that ended long ago never changes in ERA5; a recent one can still be revised, so it is cached
# for a while.
RECENT_DAYS = 60
RECENT_TTL_SECONDS = 6 * 3600
CACHE_ENTRIES = 256
HTTP_TIMEOUT_SECONDS = 20

Point = tuple[float, float]  # (lat, lon)
# (points, start, end) -> one dict of daily lists per point, in the order of the points.
Fetcher = Callable[[Sequence[Point], date, date], list[dict[str, list[float | None]]]]


class WeatherUnavailable(Exception):
    """The weather service could not be reached or answered with something we cannot read."""


class RateLimited(WeatherUnavailable):
    """The weather service answered 429: too many calls in a short time. Worth retrying after a pause."""


class WeatherOutOfRange(ValueError):
    """The month is before the ERA5 archive or has not started yet."""


@dataclass(frozen=True)
class WeatherSummary:
    year: int
    month: int
    # Requested days (the whole month, or up to today for the current one) and the days that have values.
    start: date
    end: date
    available_from: date | None
    available_through: date | None
    days_available: int
    days_requested: int
    points_in_area: int
    points_used: int
    temperature_mean_c: float | None
    wind_speed_mean_kmh: float | None
    # Where the wind blows FROM (meteorological convention), from the mean wind vector.
    wind_direction_from_deg: float | None
    wind_direction_from: str | None
    # Length of the mean wind vector over the mean speed: 1 = always the same direction, near 0 = it keeps
    # changing.
    wind_direction_steadiness: float | None


# ---- Which ERA5 points belong to a box --------------------------------------------------------------------


def _axis(low: float, high: float) -> list[float]:
    first = math.ceil(round(low / ERA5_GRID_DEG, 9))
    last = math.floor(round(high / ERA5_GRID_DEG, 9))
    return [round(k * ERA5_GRID_DEG, 4) for k in range(first, last + 1)]


def _spread(values: list[float], keep: int) -> list[float]:
    """`keep` evenly spaced values of the list, ends included."""
    if len(values) <= keep:
        return values
    return [values[round(i * (len(values) - 1) / (keep - 1))] for i in range(keep)]


def era5_points(bounds: Bounds) -> tuple[int, list[Point]]:
    """(number of ERA5 points inside the box, the points to ask for)."""
    lats = _axis(bounds.south, bounds.north)
    lons = _axis(bounds.west, bounds.east)
    if not lats or not lons:
        centre_lat = (bounds.south + bounds.north) / 2
        centre_lon = (bounds.west + bounds.east) / 2
        nearest = (
            round(round(centre_lat / ERA5_GRID_DEG) * ERA5_GRID_DEG, 4),
            round(round(centre_lon / ERA5_GRID_DEG) * ERA5_GRID_DEG, 4),
        )
        return 1, [nearest]
    total = len(lats) * len(lons)
    side = int(math.isqrt(MAX_POINTS))
    lats, lons = _spread(lats, side), _spread(lons, side)
    return total, [(lat, lon) for lat in lats for lon in lons]


# ---- Reading the service ----------------------------------------------------------------------------------


def fetch_open_meteo(points: Sequence[Point], start: date, end: date) -> list[dict[str, list[float | None]]]:
    query = urllib.parse.urlencode(
        {
            "latitude": ",".join(str(lat) for lat, _ in points),
            "longitude": ",".join(str(lon) for _, lon in points),
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "daily": ",".join(DAILY),
            "models": MODEL,  # never `best_match`: it can mix models across decades
            "timezone": "UTC",
        }
    )
    request = urllib.request.Request(f"{ARCHIVE_URL}?{query}", headers={"User-Agent": "astro-dashboard"})
    try:
        # The URL is the fixed https endpoint above, never user input.
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 429:
            raise RateLimited("The weather service asked for a pause (too many calls).") from error
        raise WeatherUnavailable(f"The weather service answered {error.code}.") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
        raise WeatherUnavailable("The weather service could not be reached.") from error
    locations = payload if isinstance(payload, list) else [payload]
    try:
        return [dict(location["daily"]) for location in locations]
    except (KeyError, TypeError) as error:
        raise WeatherUnavailable("The weather service answered in an unexpected format.") from error


# ---- Summary ----------------------------------------------------------------------------------------------


def _month_bounds(year: int, month: int, today: date) -> tuple[date, date]:
    start = date(year, month, 1)
    if year < FIRST_YEAR or start > today:
        raise WeatherOutOfRange("ERA5 has no values for that month.")
    following = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start, min(following - timedelta(days=1), today)


def summarize(
    daily: list[dict[str, list[float | None]]],
    start: date,
    end: date,
    year: int,
    month: int,
    points_in_area: int,
) -> WeatherSummary:
    """Area means of the days that have values. Missing is missing: it is never counted as zero."""
    n_days = (end - start).days + 1
    temps: list[float] = []
    speeds: list[float] = []
    east = north = 0.0
    n_vectors = 0
    days_with_values: set[int] = set()
    for point in daily:
        t = point.get("temperature_2m_mean", [])
        s = point.get("wind_speed_10m_mean", [])
        d = point.get("wind_direction_10m_dominant", [])
        for i in range(min(n_days, len(t))):
            if t[i] is not None:
                temps.append(t[i])
                days_with_values.add(i)
        for i in range(min(n_days, len(s), len(d))):
            if s[i] is None or d[i] is None:
                continue
            speeds.append(s[i])
            rad = math.radians(d[i])
            # Meteorological direction: the wind blows from d, so it moves toward the opposite side.
            east += -s[i] * math.sin(rad)
            north += -s[i] * math.cos(rad)
            n_vectors += 1
            days_with_values.add(i)

    first = min(days_with_values) if days_with_values else None
    last = max(days_with_values) if days_with_values else None
    direction = steadiness = None
    cardinal = None
    if n_vectors and speeds and sum(speeds) > 0:
        east, north = east / n_vectors, north / n_vectors
        resultant = math.hypot(east, north)
        steadiness = round(resultant / (sum(speeds) / len(speeds)), 2)
        if resultant > 0:
            direction = round(math.degrees(math.atan2(-east, -north)) % 360, 1)
            cardinal = CARDINALS[int((direction + 11.25) // 22.5) % 16]
    return WeatherSummary(
        year=year,
        month=month,
        start=start,
        end=end,
        available_from=None if first is None else start + timedelta(days=first),
        available_through=None if last is None else start + timedelta(days=last),
        days_available=len(days_with_values),
        days_requested=n_days,
        points_in_area=points_in_area,
        points_used=len(daily),
        temperature_mean_c=round(sum(temps) / len(temps), 1) if temps else None,
        wind_speed_mean_kmh=round(sum(speeds) / len(speeds), 1) if speeds else None,
        wind_direction_from_deg=direction,
        wind_direction_from=cardinal,
        wind_direction_steadiness=steadiness,
    )


# ---- A map layer: one value per sampled ERA5 point -------------------------------------------------------

GRID_STEPS_DEG = (0.25, 0.5, 1.0, 2.0)  # the finest spacing that keeps a request small is used
GRID_MAX_POINTS = 400
GRID_CHUNK = 50  # points per request to the service


@dataclass(frozen=True)
class WeatherPoint:
    lat: float
    lon: float
    temperature_c: float | None
    wind_speed_kmh: float | None
    # Where the wind blows FROM (meteorological convention), of the point's mean wind vector.
    wind_from_deg: float | None
    days_available: int


@dataclass(frozen=True)
class WeatherGrid:
    year: int
    month: int
    start: date
    end: date
    available_through: date | None
    days_requested: int
    step_deg: float
    points: list[WeatherPoint]


def grid_points(bounds: Bounds) -> tuple[float, list[Point]]:
    """The ERA5 points of the box on a regular lattice, as fine as GRID_MAX_POINTS allows (0.25 to 2 degrees).

    The lattice is a sub-grid of ERA5's own (multiples of the step): every point is a real ERA5 grid point."""
    for step in GRID_STEPS_DEG:
        lats = _lattice(bounds.south, bounds.north, step)
        lons = _lattice(bounds.west, bounds.east, step)
        if lats and lons and len(lats) * len(lons) <= GRID_MAX_POINTS:
            return step, [(lat, lon) for lat in lats for lon in lons]
    # A box so small it holds no point of any lattice: the nearest ERA5 point (the layer is then one point).
    _, points = era5_points(bounds)
    return ERA5_GRID_DEG, points[:1]


def _lattice(low: float, high: float, step: float) -> list[float]:
    first = math.ceil(round(low / step, 9))
    last = math.floor(round(high / step, 9))
    return [round(k * step, 4) for k in range(first, last + 1)]


def _point_summary(
    point: Point, daily: dict[str, list[float | None]], n_days: int
) -> tuple[WeatherPoint, int | None]:
    """The monthly means of one point, and the index of the latest day that has a value (None if none)."""
    base = date(2000, 1, 1)
    one = summarize([daily], base, base + timedelta(days=n_days - 1), 2000, 1, 1)
    last = None if one.available_through is None else (one.available_through - base).days
    return WeatherPoint(
        lat=point[0],
        lon=point[1],
        temperature_c=one.temperature_mean_c,
        wind_speed_kmh=one.wind_speed_mean_kmh,
        wind_from_deg=one.wind_direction_from_deg,
        days_available=one.days_available,
    ), last


class WeatherService:
    """Asks ERA5 once per (area, month) and remembers the answer in memory (no files, no cloud resources)."""

    def __init__(self, fetch: Fetcher = fetch_open_meteo, clock: Callable[[], float] = time.time) -> None:
        self._fetch = fetch
        self._clock = clock
        self._lock = threading.Lock()
        self._cache: dict[tuple, tuple[float | None, WeatherSummary]] = {}
        self._grids: dict[tuple, tuple[float | None, WeatherGrid]] = {}

    def month_summary(
        self, bounds: Bounds, year: int, month: int, today: date | None = None
    ) -> WeatherSummary:
        today = today or date.today()
        start, end = _month_bounds(year, month, today)
        total, points = era5_points(bounds)
        key = (year, month, end, tuple(points))
        now = self._clock()
        with self._lock:
            hit = self._cache.get(key)
        if hit and (hit[0] is None or hit[0] > now):
            return hit[1]
        daily = self._fetch(points, start, end)
        summary = summarize(daily, start, end, year, month, total)
        settled = (today - end).days > RECENT_DAYS
        with self._lock:
            if len(self._cache) >= CACHE_ENTRIES:
                self._cache.pop(next(iter(self._cache)))
            self._cache[key] = (None if settled else now + RECENT_TTL_SECONDS, summary)
        return summary

    def month_grid(self, bounds: Bounds, year: int, month: int, today: date | None = None) -> WeatherGrid:
        """One monthly mean per sampled ERA5 point, for the map. Asked in chunks, cached like the summary."""
        today = today or date.today()
        start, end = _month_bounds(year, month, today)
        step, points = grid_points(bounds)
        key = (year, month, end, tuple(points))
        now = self._clock()
        with self._lock:
            hit = self._grids.get(key)
        if hit and (hit[0] is None or hit[0] > now):
            return hit[1]
        n_days = (end - start).days + 1
        out: list[WeatherPoint] = []
        last_day = -1
        for i in range(0, len(points), GRID_CHUNK):
            chunk = points[i : i + GRID_CHUNK]
            for point, daily in zip(chunk, self._fetch(chunk, start, end), strict=True):
                summary, last = _point_summary(point, daily, n_days)
                out.append(summary)
                if last is not None:
                    last_day = max(last_day, last)
        through = start + timedelta(days=last_day) if last_day >= 0 else None
        grid = WeatherGrid(
            year=year,
            month=month,
            start=start,
            end=end,
            available_through=through,
            days_requested=n_days,
            step_deg=step,
            points=out,
        )
        settled = (today - end).days > RECENT_DAYS
        with self._lock:
            if len(self._grids) >= CACHE_ENTRIES:
                self._grids.pop(next(iter(self._grids)))
            self._grids[key] = (None if settled else now + RECENT_TTL_SECONDS, grid)
        return grid
