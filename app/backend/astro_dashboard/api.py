"""HTTP API for the dashboard (tasks D2 and D6).

`GET /api/calendar` returns the monthly series of an area: the harmonized counts of its cells summed, with the
origin of each month, the historical median and the anomalies of the sum. See calendar.py for the rules.
`GET /api/hotspots/count` and `GET /api/hotspots.csv` give the native hotspots of the same cells and dates
(hotspots.py). `GET /api/weather` is a separate context layer: ERA5 temperature and wind for the area and
a month,
from Open-Meteo (weather.py). It never feeds the hotspot numbers.
"""

from __future__ import annotations

import logging
import os
from dataclasses import asdict
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from astro_dashboard import hotspots
from astro_dashboard.bake import read_build_info
from astro_dashboard.calendar import Bounds, CalendarStore, NoCellsInArea
from astro_dashboard.weather import (
    MODEL as WEATHER_MODEL,
)
from astro_dashboard.weather import (
    SOURCE as WEATHER_SOURCE,
)
from astro_dashboard.weather import (
    WeatherOutOfRange,
    WeatherService,
    WeatherUnavailable,
)
from astro_dashboard.weather_live import INTERVAL_SECONDS, LIVE_TTL_SECONDS, LiveWindService
from astro_dashboard.weather_live import SOURCE as LIVE_SOURCE

log = logging.getLogger("astro_dashboard")

router = APIRouter(prefix="/api", tags=["calendar"])


def data_root_from_env() -> str:
    """`$ASTRO_DATA_ROOT`, default `data`. In the image: /app/data, where the calendar is baked in (D8)."""
    return (os.environ.get("ASTRO_DATA_ROOT") or "data").rstrip("/")


def load_store_from_env() -> CalendarStore | None:
    """Load `calendar/v1` from `$ASTRO_DATA_ROOT` (default `data`).

    None if it is not there: the app still starts, so `/healthz` answers, and the calendar endpoint says the
    data is missing."""
    root = data_root_from_env()
    version = os.environ.get("ASTRO_DATASET_VERSION") or "v1"
    if root.startswith("gs://"):
        # D8: the calendar is baked into the image; only the native hotspots are read from the bucket (D6).
        log.warning("ASTRO_DATA_ROOT=%s: the calendar is not read from Cloud Storage; it is baked in.", root)
        return None
    try:
        store = CalendarStore.from_data_root(root, version)
    except FileNotFoundError as error:
        log.warning("Calendar data not loaded: %s", error)
        return None
    log.info(
        "Calendar loaded: %s rows, %s-%s, model %s",
        store.rows,
        store.first_year,
        store.last_year,
        store.model_version,
    )
    baked = os.environ.get("ASTRO_MODEL_VERSION")
    if baked and baked != store.model_version:
        log.warning(
            "The image was built for model %s but the loaded calendar is %s.", baked, store.model_version
        )
    return store


def get_store(request: Request) -> CalendarStore:
    store: CalendarStore | None = getattr(request.app.state, "calendar", None)
    if store is None:
        raise HTTPException(
            status_code=503,
            detail="Calendar data is not available on this server. Set ASTRO_DATA_ROOT to a folder with "
            "processed/calendar/v1.",
        )
    return store


class AreaOut(BaseModel):
    west: float
    south: float
    east: float
    north: float
    cells: int


class MonthOut(BaseModel):
    year: int
    month: int
    # VIIRS-equivalent hotspot detections, summed over the cells of the area (never "fires"). None = the month
    # has no estimate (the estimated partial months of 2002); never zero.
    count_harmonized: float | None
    # Approximate 90% interval (summed variance widened by n_cells ** 0.32). None = a contributing cell has no
    # variance yet; never zero.
    ci_low: float | None
    ci_high: float | None
    is_estimated: bool
    is_partial: bool
    days_observed: int
    origin: str
    source_satellite: str
    # Median of the same month over `median_n_years` years. For the unfinished month it is the median of the
    # same days (1..`median_days`) of earlier years, from month_to_date/v1; other partial months have none.
    median_hist: float | None
    median_n_years: int | None
    median_days: int | None
    anomaly_abs: float | None
    anomaly_pct: float | None
    anomaly_z: float | None
    # Native filtered counts per satellite, summed over the area. Never add them together: MODIS and VIIRS are
    # different instruments. None = the satellite had no data in that month.
    raw_aqua: int | None
    raw_terra: int | None
    raw_snpp: int | None
    raw_n20: int | None
    # Native count of source_satellite: what a chart of raw counts shows (the false step of 2012).
    raw_source: int | None


class CalendarResponse(BaseModel):
    area: AreaOut
    period: Literal["ALL", "D", "N"]
    model_version: str
    # True when the interval of the sum is the area approximation (sum(var) x n^0.32, more than one cell).
    interval_is_approximate: bool
    # Years the median is computed over (complete months only). None if there is no complete month.
    baseline_years: tuple[int, int] | None
    first_year: int
    last_year: int
    months: list[MonthOut]


@router.get("/calendar", response_model=CalendarResponse)
def calendar(
    store: Annotated[CalendarStore, Depends(get_store)],
    west: float = Query(..., ge=-180, le=180),
    south: float = Query(..., ge=-90, le=90),
    east: float = Query(..., ge=-180, le=180),
    north: float = Query(..., ge=-90, le=90),
    period: Literal["ALL", "D", "N"] = "ALL",
    baseline_start: int | None = Query(None, ge=1900, le=2200),
    baseline_end: int | None = Query(None, ge=1900, le=2200),
) -> CalendarResponse:
    if west >= east or south >= north:
        raise HTTPException(status_code=422, detail="The box needs west < east and south < north.")
    if (baseline_start is None) != (baseline_end is None):
        raise HTTPException(status_code=422, detail="Give both baseline_start and baseline_end, or neither.")
    baseline = None
    if baseline_start is not None and baseline_end is not None:
        if baseline_start > baseline_end:
            raise HTTPException(status_code=422, detail="baseline_start must not be after baseline_end.")
        baseline = (baseline_start, baseline_end)

    bounds = Bounds(west=west, south=south, east=east, north=north)
    try:
        result = store.area_calendar(bounds, period, baseline)
    except NoCellsInArea as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return CalendarResponse(
        area=AreaOut(west=west, south=south, east=east, north=north, cells=result.cells),
        period=period,
        model_version=result.model_version,
        interval_is_approximate=result.cells > 1,
        baseline_years=result.baseline_years,
        first_year=result.first_year,
        last_year=result.last_year,
        months=[MonthOut(**asdict(m)) for m in result.months],
    )


_DEFAULT_WEATHER = WeatherService()


def get_weather(request: Request) -> WeatherService:
    """The weather service of this server; tests put a fake one on `app.state.weather`."""
    service: WeatherService | None = getattr(request.app.state, "weather", None)
    return service or _DEFAULT_WEATHER


class WeatherOut(BaseModel):
    source: str
    model: str
    year: int
    month: int
    # UTC days asked for (the whole month, or up to today for the current one) and the days that have values.
    start: date
    end: date
    available_from: date | None
    available_through: date | None
    days_available: int
    days_requested: int
    # "ok": every requested day has values. "partial": the latest days are not published yet.
    # "unavailable": none.
    status: Literal["ok", "partial", "unavailable"]
    # ERA5 grid points inside the box, and the regular sub-grid actually asked for.
    points_in_area: int
    points_used: int
    temperature_mean_c: float | None
    wind_speed_mean_kmh: float | None
    wind_direction_from_deg: float | None
    wind_direction_from: str | None
    wind_direction_steadiness: float | None


@router.get("/weather", response_model=WeatherOut, tags=["weather"])
def weather(
    service: Annotated[WeatherService, Depends(get_weather)],
    year: int = Query(..., ge=1940, le=2200),
    month: int = Query(..., ge=1, le=12),
    west: float = Query(..., ge=-180, le=180),
    south: float = Query(..., ge=-90, le=90),
    east: float = Query(..., ge=-180, le=180),
    north: float = Query(..., ge=-90, le=90),
) -> WeatherOut:
    """Context only: ERA5 reanalysis for the area and month. It says nothing about causes of hotspots."""
    if west >= east or south >= north:
        raise HTTPException(status_code=422, detail="The box needs west < east and south < north.")
    try:
        summary = service.month_summary(Bounds(west=west, south=south, east=east, north=north), year, month)
    except WeatherOutOfRange as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except WeatherUnavailable as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    if summary.days_available == 0:
        status = "unavailable"
    elif summary.days_available < summary.days_requested or summary.end < _month_end(year, month):
        status = "partial"
    else:
        status = "ok"
    return WeatherOut(
        source=WEATHER_SOURCE,
        model=WEATHER_MODEL,
        status=status,
        **{k: getattr(summary, k) for k in WeatherOut.model_fields if hasattr(summary, k)},
    )


class WeatherPointOut(BaseModel):
    lat: float
    lon: float
    # Monthly means at one ERA5 grid point; None = no value (never zero).
    temperature_c: float | None
    wind_speed_kmh: float | None
    # Where the wind blows FROM (meteorological convention).
    wind_from_deg: float | None
    days_available: int


class WeatherGridOut(BaseModel):
    source: str
    model: str
    year: int
    month: int
    start: date
    end: date
    available_through: date | None
    days_requested: int
    status: Literal["ok", "partial", "unavailable"]
    # Spacing of the sampled ERA5 points (a sub-grid of the 0.25 degree grid): a sample, not a surface.
    step_deg: float
    points: list[WeatherPointOut]


@router.get("/weather/grid", response_model=WeatherGridOut, tags=["weather"])
def weather_grid(
    service: Annotated[WeatherService, Depends(get_weather)],
    year: int = Query(..., ge=1940, le=2200),
    month: int = Query(..., ge=1, le=12),
    west: float = Query(..., ge=-180, le=180),
    south: float = Query(..., ge=-90, le=90),
    east: float = Query(..., ge=-180, le=180),
    north: float = Query(..., ge=-90, le=90),
) -> WeatherGridOut:
    """Context only: the monthly ERA5 means at sampled grid points of the area, for the map layers."""
    if west >= east or south >= north:
        raise HTTPException(status_code=422, detail="The box needs west < east and south < north.")
    try:
        grid = service.month_grid(Bounds(west=west, south=south, east=east, north=north), year, month)
    except WeatherOutOfRange as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except WeatherUnavailable as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    with_values = [p for p in grid.points if p.days_available > 0]
    if not with_values:
        status = "unavailable"
    elif grid.available_through is None or grid.available_through < _month_end(year, month):
        status = "partial"
    else:
        status = "ok"
    return WeatherGridOut(
        source=WEATHER_SOURCE,
        model=WEATHER_MODEL,
        status=status,
        year=grid.year,
        month=grid.month,
        start=grid.start,
        end=grid.end,
        available_through=grid.available_through,
        days_requested=grid.days_requested,
        step_deg=grid.step_deg,
        points=[WeatherPointOut(**asdict(p)) for p in grid.points],
    )


_DEFAULT_LIVE = LiveWindService()


def get_live(request: Request) -> LiveWindService:
    service: LiveWindService | None = getattr(request.app.state, "live_wind", None)
    return service or _DEFAULT_LIVE


class LivePointOut(BaseModel):
    lat: float
    lon: float
    temperature_c: float | None
    wind_speed_kmh: float | None
    # Where the wind blows FROM (meteorological convention).
    wind_from_deg: float | None
    gust_kmh: float | None


class LiveWindOut(BaseModel):
    source: str
    region: AreaOutNoCells
    step_deg: float
    # When this server asked the service, and the model time the service reported (UTC, ISO).
    fetched_at: datetime
    model_time: str | None
    interval_seconds: int
    ttl_seconds: int
    # True when the service could not be reached (or the daily budget is spent): the last good answer.
    stale: bool
    stale_reason: str | None
    points: list[LivePointOut]


class AreaOutNoCells(BaseModel):
    west: float
    south: float
    east: float
    north: float


@router.get("/weather/live", response_model=LiveWindOut, tags=["weather"])
def weather_live(service: Annotated[LiveWindService, Depends(get_live)]) -> LiveWindOut:
    """Live wind for a fixed, wide region, shared and cached for every visitor. Context only."""
    try:
        snap = service.snapshot()
    except WeatherUnavailable as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return LiveWindOut(
        source=LIVE_SOURCE,
        region=AreaOutNoCells(**asdict(snap.region)),
        step_deg=snap.step_deg,
        fetched_at=datetime.fromtimestamp(snap.fetched_at, tz=UTC),
        model_time=snap.model_time,
        interval_seconds=INTERVAL_SECONDS,
        ttl_seconds=LIVE_TTL_SECONDS,
        stale=snap.stale,
        stale_reason=snap.stale_reason,
        points=[LivePointOut(**asdict(p)) for p in snap.points],
    )


def _month_end(year: int, month: int) -> date:
    following = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return following - timedelta(days=1)


@router.get("/version", tags=["meta"])
def version(request: Request) -> dict:
    """What this server runs on: the model_version of the loaded calendar and, in an image with the calendar
    baked in (D8), what the build recorded. The two agree unless other data was mounted over the baked one."""
    store: CalendarStore | None = getattr(request.app.state, "calendar", None)
    return {
        "model_version": store.model_version if store else None,
        "image_model_version": os.environ.get("ASTRO_MODEL_VERSION") or None,
        "build": read_build_info(data_root_from_env()),
    }


FIRST_DATE = date(2000, 1, 1)


def _hotspot_query(
    store: CalendarStore,
    west: float,
    south: float,
    east: float,
    north: float,
    start: date,
    end: date,
    period: str,
    include_all: bool,
) -> hotspots.HotspotQuery:
    if west >= east or south >= north:
        raise HTTPException(status_code=422, detail="The box needs west < east and south < north.")
    if start > end:
        raise HTTPException(status_code=422, detail="start must not be after end.")
    if start < FIRST_DATE:
        raise HTTPException(status_code=422, detail=f"start must be {FIRST_DATE.isoformat()} or later.")
    cells = store.cells_in(Bounds(west=west, south=south, east=east, north=north))
    if not cells:
        raise HTTPException(status_code=422, detail="The selected area overlaps no 0.25 degree cell.")
    return hotspots.HotspotQuery(cells=cells, start=start, end=end, period=period, include_all=include_all)


class HotspotCountOut(BaseModel):
    # Native hotspot detections (NASA FIRMS) of the area cells and dates; never "fires".
    rows: int
    max_rows: int
    cells: int
    start: date
    end: date
    period: Literal["ALL", "D", "N"]
    include_all: bool


@router.get("/hotspots/count", response_model=HotspotCountOut, tags=["hotspots"])
def hotspots_count(
    store: Annotated[CalendarStore, Depends(get_store)],
    start: Annotated[date, Query(description="First local solar date, YYYY-MM-DD")],
    end: Annotated[date, Query(description="Last local solar date, YYYY-MM-DD")],
    west: float = Query(..., ge=-180, le=180),
    south: float = Query(..., ge=-90, le=90),
    east: float = Query(..., ge=-180, le=180),
    north: float = Query(..., ge=-90, le=90),
    period: Literal["ALL", "D", "N"] = "ALL",
    include_all: bool = False,
) -> HotspotCountOut:
    query = _hotspot_query(store, west, south, east, north, start, end, period, include_all)
    try:
        rows = hotspots.count(query)
    except hotspots.HotspotsUnavailable as error:
        log.warning("Hotspots count failed: %s", error)
        raise HTTPException(status_code=503, detail="The native hotspots are not available.") from error
    return HotspotCountOut(
        rows=rows,
        max_rows=hotspots.max_rows(),
        cells=len(query.cells),
        start=start,
        end=end,
        period=period,
        include_all=include_all,
    )


@router.get("/hotspots.csv", tags=["hotspots"], response_class=StreamingResponse)
def hotspots_csv(
    store: Annotated[CalendarStore, Depends(get_store)],
    start: Annotated[date, Query(description="First local solar date, YYYY-MM-DD")],
    end: Annotated[date, Query(description="Last local solar date, YYYY-MM-DD")],
    west: float = Query(..., ge=-180, le=180),
    south: float = Query(..., ge=-90, le=90),
    east: float = Query(..., ge=-180, le=180),
    north: float = Query(..., ge=-90, le=90),
    period: Literal["ALL", "D", "N"] = "ALL",
    include_all: bool = False,
) -> StreamingResponse:
    query = _hotspot_query(store, west, south, east, north, start, end, period, include_all)
    try:
        body = hotspots.export_csv(query)
    except hotspots.Busy as error:
        raise HTTPException(status_code=429, detail=str(error), headers={"Retry-After": "10"}) from error
    except hotspots.TooManyRows as error:
        raise HTTPException(status_code=413, detail=str(error)) from error
    except hotspots.HotspotsUnavailable as error:
        log.warning("Hotspots export failed: %s", error)
        raise HTTPException(status_code=503, detail="The native hotspots are not available.") from error

    box = "_".join(f"{v:g}" for v in (west, south, east, north))
    suffix = "" if period == "ALL" else f"_{period}"
    suffix += "_all-confidence" if include_all else ""
    filename = f"astro-hotspots_{box}_{start.isoformat()}_{end.isoformat()}{suffix}.csv"
    return StreamingResponse(
        body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )
