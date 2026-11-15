"""Live wind: one shared snapshot, cached, with a daily budget and a stale answer when the service fails."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from astro_dashboard.main import app
from astro_dashboard.weather import WeatherUnavailable
from astro_dashboard.weather_live import (
    LIVE_DAILY_BUDGET,
    LIVE_REGION,
    LIVE_TTL_SECONDS,
    LiveWindService,
    live_points,
)


class Fetch:
    def __init__(self, fail: bool = False) -> None:
        self.calls = 0
        self.fail = fail

    def __call__(self, points):  # noqa: ANN001
        self.calls += 1
        if self.fail:
            raise WeatherUnavailable("The weather service could not be reached.")
        return [
            {
                "time": "2026-11-15T06:45",
                "temperature_2m": 25.0,
                "wind_speed_10m": 20.0,
                "wind_direction_10m": 90,
                "wind_gusts_10m": 31.0,
            }
            for _ in points
        ]


class Clock:
    def __init__(self, now: float = 1_800_000_000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def test_the_region_is_wider_than_the_study_area_and_asked_in_one_request() -> None:
    points = live_points()
    assert LIVE_REGION.west < -48.8 and LIVE_REGION.east > -34.7  # beyond the pilot box
    assert len(points) <= 300  # one request, one call per location
    assert all(LIVE_REGION.south <= lat <= LIVE_REGION.north for lat, _ in points)


def test_a_second_request_inside_the_ttl_costs_nothing() -> None:
    fetch, clock = Fetch(), Clock()
    service = LiveWindService(fetch=fetch, clock=clock)
    first = service.snapshot()
    clock.now += LIVE_TTL_SECONDS - 1
    again = service.snapshot()
    assert fetch.calls == 1 and again is first and not again.stale
    clock.now += 2
    service.snapshot()
    assert fetch.calls == 2


def test_the_snapshot_keeps_every_point_and_the_model_time() -> None:
    snap = LiveWindService(fetch=Fetch(), clock=Clock()).snapshot()
    assert snap.model_time == "2026-11-15T06:45"
    assert len(snap.points) == len(live_points())
    assert snap.points[0].wind_speed_kmh == 20.0 and snap.points[0].wind_from_deg == 90.0


def test_when_the_service_fails_the_last_answer_is_served_and_flagged() -> None:
    fetch, clock = Fetch(), Clock()
    service = LiveWindService(fetch=fetch, clock=clock)
    service.snapshot()
    fetch.fail = True
    clock.now += LIVE_TTL_SECONDS + 5
    stale = service.snapshot()
    assert stale.stale and "could not be reached" in (stale.stale_reason or "")
    assert stale.points  # never an empty map presented as fresh


def test_with_no_answer_at_all_a_failure_is_an_error_not_invented_data() -> None:
    service = LiveWindService(fetch=Fetch(fail=True), clock=Clock())
    with pytest.raises(WeatherUnavailable):
        service.snapshot()


def test_the_daily_budget_stops_the_refreshes_and_resets_the_next_day() -> None:
    # Start at 00:00 UTC so the 45 refreshes (22.5 hours of TTLs) stay inside one UTC day.
    fetch, clock = Fetch(), Clock(1_800_000_000.0 - 1_800_000_000.0 % 86400)
    service = LiveWindService(fetch=fetch, clock=clock)
    refreshes = LIVE_DAILY_BUDGET // len(live_points())
    for _ in range(refreshes):
        service.snapshot()
        clock.now += LIVE_TTL_SECONDS + 1
    assert fetch.calls == refreshes
    over = service.snapshot()  # the budget is spent: the last answer, flagged
    assert fetch.calls == refreshes and over.stale and "budget" in (over.stale_reason or "")
    clock.now += 24 * 3600  # a new UTC day
    fresh = service.snapshot()
    assert fetch.calls == refreshes + 1 and not fresh.stale


@pytest.fixture
def client():
    app.state.live_wind = LiveWindService(fetch=Fetch(), clock=Clock())
    with TestClient(app) as c:
        yield c
    del app.state.live_wind


def test_endpoint_shape(client: TestClient) -> None:
    body = client.get("/api/weather/live").json()
    assert "current conditions" in body["source"] and "not observations" in body["source"]
    assert body["stale"] is False and body["interval_seconds"] == 900
    assert body["region"]["west"] == LIVE_REGION.west
    assert body["points"][0]["wind_from_deg"] == 90.0 and "fetched_at" in body


def test_endpoint_502_when_nothing_is_available() -> None:
    app.state.live_wind = LiveWindService(fetch=Fetch(fail=True), clock=Clock())
    try:
        with TestClient(app) as c:
            assert c.get("/api/weather/live").status_code == 502
    finally:
        del app.state.live_wind
