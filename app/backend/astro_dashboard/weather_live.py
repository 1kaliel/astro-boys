"""Live wind (and temperature) for a wide region, from the Open-Meteo Forecast API, `current` conditions.

This is NOT the historical ERA5 of weather.py. ERA5 is published a few days late, so it cannot show "now". The
`current` block of the forecast API is the model's analysis of the present moment, refreshed every 15 minutes.
It is a model field, not a station observation, and it has nothing to do with the hotspot data: it is
context for the map.

One shared answer for the whole server keeps us far inside the free limits (fewer than 10,000 calls a day,
600 a minute; every location of a request counts as one call):

* one region, fixed (`LIVE_REGION`), far wider than the study area, on a regular lattice of `LIVE_STEP_DEG`;
* the answer is cached for `LIVE_TTL_SECONDS`; a request inside that time costs nothing;
* a daily budget (`LIVE_DAILY_BUDGET`, in locations) stops refreshing when it is spent;
* if the service fails or the budget is spent, the last good answer is served and flagged `stale`;
* the last answer and the day's spending are also kept in a small cache folder (`ASTRO_WEATHER_CACHE`, a temp
  folder by default), so a restart does not ask the service again for an answer that is still fresh. Cloud Run
  instances do not share that folder: a store every instance can read needs a bucket the service may write to,
  which needs the owner of the cloud project (docs/cloud/iam-and-access.md).
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from astro_dashboard.calendar import Bounds
from astro_dashboard.weather import HTTP_TIMEOUT_SECONDS, Point, WeatherUnavailable, _lattice

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
SOURCE = "Open-Meteo Forecast API, current conditions of the weather model (not observations, not ERA5)"
LIVE_REGION = Bounds(west=-75.0, south=-35.0, east=-25.0, north=8.0)
LIVE_STEP_DEG = 3.0
LIVE_TTL_SECONDS = 90 * 60
LIVE_DAILY_BUDGET = 4000  # locations asked per UTC day; the free limit is 10,000 calls
CURRENT = ("temperature_2m", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m")
INTERVAL_SECONDS = 900  # how often the service updates `current`

log = logging.getLogger("astro_dashboard")
LiveFetcher = Callable[[Sequence[Point]], list[dict]]


@dataclass(frozen=True)
class LivePoint:
    lat: float
    lon: float
    temperature_c: float | None
    wind_speed_kmh: float | None
    # Where the wind blows FROM (meteorological convention).
    wind_from_deg: float | None
    gust_kmh: float | None


@dataclass(frozen=True)
class LiveSnapshot:
    region: Bounds
    step_deg: float
    fetched_at: float  # epoch seconds, when we asked
    model_time: str | None  # the latest `current.time` the service reported (UTC, ISO)
    points: list[LivePoint]
    stale: bool = False
    stale_reason: str | None = None


def live_points() -> list[Point]:
    lats = _lattice(LIVE_REGION.south, LIVE_REGION.north, LIVE_STEP_DEG)
    lons = _lattice(LIVE_REGION.west, LIVE_REGION.east, LIVE_STEP_DEG)
    return [(lat, lon) for lat in lats for lon in lons]


def fetch_forecast_current(points: Sequence[Point]) -> list[dict]:
    query = urllib.parse.urlencode(
        {
            "latitude": ",".join(str(lat) for lat, _ in points),
            "longitude": ",".join(str(lon) for _, lon in points),
            "current": ",".join(CURRENT),
            "wind_speed_unit": "kmh",
            "timezone": "UTC",
        }
    )
    request = urllib.request.Request(f"{FORECAST_URL}?{query}", headers={"User-Agent": "astro-dashboard"})
    try:
        # The URL is the fixed https endpoint above, never user input.
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        raise WeatherUnavailable(f"The weather service answered {error.code}.") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
        raise WeatherUnavailable("The weather service could not be reached.") from error
    locations = payload if isinstance(payload, list) else [payload]
    try:
        return [dict(location["current"]) for location in locations]
    except (KeyError, TypeError) as error:
        raise WeatherUnavailable("The weather service answered in an unexpected format.") from error


def _number(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) else None


class LiveWindService:
    """One shared, cached snapshot of the live wind over `LIVE_REGION`."""

    def __init__(
        self,
        fetch: LiveFetcher = fetch_forecast_current,
        clock: Callable[[], float] = time.time,
        cache_dir: Path | None = None,
    ) -> None:
        self._fetch = fetch
        self._clock = clock
        self._cache_dir = cache_dir
        self._loaded = cache_dir is None
        self._lock = threading.Lock()
        self._snapshot: LiveSnapshot | None = None
        self._spent_day: str | None = None
        self._spent = 0

    def snapshot(self) -> LiveSnapshot:
        now = self._clock()
        with self._lock:  # one request at a time asks the service; the others wait for its answer
            if not self._loaded:
                self._load()
            cached = self._snapshot
            if cached and now - cached.fetched_at < LIVE_TTL_SECONDS:
                return cached
            points = live_points()
            day = datetime.fromtimestamp(now, tz=UTC).strftime("%Y-%m-%d")
            if self._spent_day != day:
                self._spent_day, self._spent = day, 0
            if self._spent + len(points) > LIVE_DAILY_BUDGET:
                return self._or_fail(cached, "The daily budget of calls to the weather service is spent.")
            self._spent += len(
                points
            )  # counted before the call: a failed call may still count at the service
            self._save_budget()
            try:
                current = self._fetch(points)
            except WeatherUnavailable as error:
                return self._or_fail(cached, str(error))
            fresh = LiveSnapshot(
                region=LIVE_REGION,
                step_deg=LIVE_STEP_DEG,
                fetched_at=now,
                model_time=max((str(c["time"]) for c in current if c.get("time")), default=None),
                points=[
                    LivePoint(
                        lat=lat,
                        lon=lon,
                        temperature_c=_number(c.get("temperature_2m")),
                        wind_speed_kmh=_number(c.get("wind_speed_10m")),
                        wind_from_deg=_number(c.get("wind_direction_10m")),
                        gust_kmh=_number(c.get("wind_gusts_10m")),
                    )
                    for (lat, lon), c in zip(points, current, strict=True)
                ],
            )
            self._snapshot = fresh
            self._save_snapshot(fresh)
            return fresh

    # ---- a small persistent copy, so a restart does not waste calls ----------------------------------------

    def _path(self, name: str) -> Path | None:
        return None if self._cache_dir is None else self._cache_dir / name

    def _write(self, name: str, payload: dict) -> None:
        path = self._path(name)
        if path is None:
            return
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".tmp")
            temporary.write_text(json.dumps(payload))
            temporary.replace(path)  # atomic: a reader never sees half a file
        except OSError as error:
            log.warning("Could not write the weather cache %s: %s", name, error)

    def _save_snapshot(self, snap: LiveSnapshot) -> None:
        self._write(
            "live-field.json",
            {
                "fetched_at": snap.fetched_at,
                "model_time": snap.model_time,
                "step_deg": snap.step_deg,
                "region": asdict(snap.region),
                "points": [asdict(p) for p in snap.points],
            },
        )

    def _save_budget(self) -> None:
        self._write("live-budget.json", {"day": self._spent_day, "spent": self._spent})

    def _load(self) -> None:
        """Read the last answer and today's spending from the cache folder, if they are there and readable."""
        self._loaded = True
        snapshot, budget = self._path("live-field.json"), self._path("live-budget.json")
        try:
            if snapshot is not None and snapshot.exists():
                raw = json.loads(snapshot.read_text())
                if raw["step_deg"] == LIVE_STEP_DEG:  # an answer of another grid is not this layer's
                    self._snapshot = LiveSnapshot(
                        region=Bounds(**raw["region"]),
                        step_deg=raw["step_deg"],
                        fetched_at=float(raw["fetched_at"]),
                        model_time=raw["model_time"],
                        points=[LivePoint(**p) for p in raw["points"]],
                    )
            if budget is not None and budget.exists():
                raw = json.loads(budget.read_text())
                self._spent_day, self._spent = raw["day"], int(raw["spent"])
        except (OSError, ValueError, KeyError, TypeError) as error:
            log.warning("Ignoring an unreadable weather cache: %s", error)
            self._snapshot = None

    @staticmethod
    def _or_fail(cached: LiveSnapshot | None, reason: str) -> LiveSnapshot:
        if cached is None:
            raise WeatherUnavailable(reason)
        return LiveSnapshot(
            region=cached.region,
            step_deg=cached.step_deg,
            fetched_at=cached.fetched_at,
            model_time=cached.model_time,
            points=cached.points,
            stale=True,
            stale_reason=reason,
        )


def default_cache_dir() -> Path:
    """`$ASTRO_WEATHER_CACHE`, else a temp folder (on Cloud Run that is memory, per instance)."""
    return Path(os.environ.get("ASTRO_WEATHER_CACHE") or Path(tempfile.gettempdir()) / "astro-weather")
