"""Municipalities of a state and their "feels like" temperature right now (first version: Ceará).

Two sources, kept apart:

* **Boundaries and names: IBGE** (Instituto Brasileiro de Geografia e Estatística), the `malhas` and
  `localidades` APIs, free and without a key. Boundaries rarely change, so they are cached for a week; if IBGE
  cannot be reached the last copy is served.
* **Weather: Open-Meteo Forecast API, `current` block**: the weather model's current conditions at one point
  per municipality (the centroid of its boundary). They are **model values, not station readings**, and the
  centroid is a point of the model grid, not the whole municipality. One shared answer is cached for two
  hours, with a daily budget, because every location of a request counts as one call at the weather service
  (free limit: fewer than 10,000 a day, shared with the live wind and the historical layers).
"""

from __future__ import annotations

import gzip
import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from astro_dashboard.weather import HTTP_TIMEOUT_SECONDS, WeatherUnavailable

IBGE_MESH = "https://servicodados.ibge.gov.br/api/v3/malhas/estados/{code}"
IBGE_NAMES = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/{code}/municipios"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
STATES = {"ce": (23, "Ceará")}  # IBGE state code and name; more states are one line each
CURRENT = ("temperature_2m", "apparent_temperature", "relative_humidity_2m", "wind_speed_10m")
BOUNDARY_TTL_SECONDS = 7 * 24 * 3600
WEATHER_TTL_SECONDS = 2 * 3600
WEATHER_DAILY_BUDGET = 2200  # locations asked per UTC day (11 refreshes of 184)
INTERVAL_SECONDS = 900

JsonFetch = Callable[[str], object]


class UnknownState(ValueError):
    """The state is not one of the supported ones."""


def fetch_json(url: str) -> object:
    request = urllib.request.Request(url, headers={"User-Agent": "astro-dashboard"})
    try:
        # Fixed https endpoints built in this module, never user input.
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            body = response.read()
        # IBGE sends gzip even when it is not asked to, and urllib does not unpack it.
        if body[:2] == b"\x1f\x8b":
            body = gzip.decompress(body)
        return json.loads(body)
    except urllib.error.HTTPError as error:
        raise WeatherUnavailable(f"A data service answered {error.code}.") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
        raise WeatherUnavailable("A data service could not be reached.") from error


# ---- Geometry ---------------------------------------------------------------------------------------


def _ring_area_centroid(ring: list[list[float]]) -> tuple[float, float, float]:
    """Signed area and centroid (lon, lat) of one ring, by the shoelace formula."""
    twice_area = sum_x = sum_y = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:], strict=False):
        cross = x0 * y1 - x1 * y0
        twice_area += cross
        sum_x += (x0 + x1) * cross
        sum_y += (y0 + y1) * cross
    if twice_area == 0:  # a degenerate ring: the mean of its points
        return 0.0, sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
    return twice_area / 2, sum_x / (3 * twice_area), sum_y / (3 * twice_area)


def centroid(geometry: dict) -> tuple[float, float]:
    """(lon, lat) of the biggest polygon of a Polygon or MultiPolygon (its outer ring)."""
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    best = max(polygons, key=lambda poly: abs(_ring_area_centroid(poly[0])[0]))
    _, lon, lat = _ring_area_centroid(best[0])
    return lon, lat


def bounds_of(features: list[dict]) -> tuple[float, float, float, float]:
    """(west, south, east, north) of a list of polygon features."""
    xs: list[float] = []
    ys: list[float] = []

    def walk(node: object) -> None:
        if isinstance(node, list) and node and isinstance(node[0], int | float):
            xs.append(float(node[0]))
            ys.append(float(node[1]))
        elif isinstance(node, list):
            for child in node:
                walk(child)

    for feature in features:
        walk(feature["geometry"]["coordinates"])
    return min(xs), min(ys), max(xs), max(ys)


# ---- Service ----------------------------------------------------------------------------------------


@dataclass(frozen=True)
class MunicipalWeather:
    code: str
    apparent_temperature_c: float | None
    temperature_c: float | None
    humidity_pct: float | None
    wind_speed_kmh: float | None


@dataclass(frozen=True)
class WeatherSnapshot:
    fetched_at: float
    model_time: str | None
    items: list[MunicipalWeather]
    stale: bool = False
    stale_reason: str | None = None


def _number(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) else None


class MunicipalityService:
    def __init__(self, fetch: JsonFetch = fetch_json, clock: Callable[[], float] = time.time) -> None:
        self._fetch = fetch
        self._clock = clock
        self._lock = threading.Lock()
        self._boundaries: dict[str, tuple[float, dict]] = {}
        self._weather: dict[str, WeatherSnapshot] = {}
        self._spent: dict[str, tuple[str, int]] = {}

    @staticmethod
    def _state(uf: str) -> tuple[int, str]:
        try:
            return STATES[uf.lower()]
        except KeyError as error:
            raise UnknownState(f"Supported states: {', '.join(sorted(STATES))}.") from error

    def boundaries(self, uf: str) -> dict:
        """GeoJSON of the municipalities: `code`, `name` and `lon`/`lat` of the centroid on each feature."""
        code, name = self._state(uf)
        now = self._clock()
        with self._lock:
            cached = self._boundaries.get(uf.lower())
            if cached and now - cached[0] < BOUNDARY_TTL_SECONDS:
                return cached[1]
            try:
                mesh = self._fetch(
                    IBGE_MESH.format(code=code)
                    + "?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima"
                )
                names = self._fetch(IBGE_NAMES.format(code=code))
            except WeatherUnavailable:
                if cached:
                    return cached[1]  # boundaries barely change: the old copy is fine
                raise
            by_code = {str(item["id"]): item["nome"] for item in names}  # type: ignore[index, union-attr]
            features = []
            for feature in mesh["features"]:  # type: ignore[index]
                municipal = str(feature["properties"]["codarea"])
                lon, lat = centroid(feature["geometry"])
                features.append(
                    {
                        "type": "Feature",
                        "geometry": feature["geometry"],
                        "properties": {
                            "code": municipal,
                            "name": by_code.get(municipal, municipal),
                            "lon": round(lon, 4),
                            "lat": round(lat, 4),
                        },
                    }
                )
            west, south, east, north = bounds_of(features)
            collection = {
                "type": "FeatureCollection",
                "state": {"uf": uf.lower(), "name": name, "code": code},
                "bounds": {"west": west, "south": south, "east": east, "north": north},
                "features": features,
            }
            self._boundaries[uf.lower()] = (now, collection)
            return collection

    def weather(self, uf: str) -> WeatherSnapshot:
        """Current conditions at each municipality centroid: shared, cached, budgeted, never invented."""
        features = self.boundaries(uf)["features"]
        now = self._clock()
        key = uf.lower()
        with self._lock:
            cached = self._weather.get(key)
            if cached and now - cached.fetched_at < WEATHER_TTL_SECONDS:
                return cached
            day = datetime.fromtimestamp(now, tz=UTC).strftime("%Y-%m-%d")
            spent_day, spent = self._spent.get(key, (day, 0))
            if spent_day != day:
                spent = 0
            if spent + len(features) > WEATHER_DAILY_BUDGET:
                return self._stale(cached, "The daily budget of calls to the weather service is spent.")
            self._spent[key] = (day, spent + len(features))
            query = urllib.parse.urlencode(
                {
                    "latitude": ",".join(str(f["properties"]["lat"]) for f in features),
                    "longitude": ",".join(str(f["properties"]["lon"]) for f in features),
                    "current": ",".join(CURRENT),
                    "wind_speed_unit": "kmh",
                    "timezone": "UTC",
                }
            )
            try:
                payload = self._fetch(f"{FORECAST_URL}?{query}")
            except WeatherUnavailable as error:
                return self._stale(cached, str(error))
            locations = payload if isinstance(payload, list) else [payload]
            try:
                currents = [dict(location["current"]) for location in locations]  # type: ignore[index]
            except (KeyError, TypeError):
                return self._stale(cached, "The weather service answered in an unexpected format.")
            fresh = WeatherSnapshot(
                fetched_at=now,
                model_time=max((str(c["time"]) for c in currents if c.get("time")), default=None),
                items=[
                    MunicipalWeather(
                        code=f["properties"]["code"],
                        apparent_temperature_c=_number(c.get("apparent_temperature")),
                        temperature_c=_number(c.get("temperature_2m")),
                        humidity_pct=_number(c.get("relative_humidity_2m")),
                        wind_speed_kmh=_number(c.get("wind_speed_10m")),
                    )
                    for f, c in zip(features, currents, strict=True)
                ],
            )
            self._weather[key] = fresh
            return fresh

    @staticmethod
    def _stale(cached: WeatherSnapshot | None, reason: str) -> WeatherSnapshot:
        if cached is None:
            raise WeatherUnavailable(reason)
        return WeatherSnapshot(
            fetched_at=cached.fetched_at,
            model_time=cached.model_time,
            items=cached.items,
            stale=True,
            stale_reason=reason,
        )
