"""ERA5 for a past month on the live lattice: disk storage, budget, 429 retries, mean flow, partial months."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from astro_dashboard.main import app
from astro_dashboard.weather import RateLimited, WeatherOutOfRange, WeatherUnavailable
from astro_dashboard.weather_live import live_points
from astro_dashboard.weather_month import (
    MONTH_DAILY_BUDGET,
    MonthBudgetSpent,
    MonthFieldService,
)

TODAY = date(2026, 11, 15)


class Fetch:
    """ERA5 answers: 30 degrees, wind of 12 km/h from the east every day, unless told otherwise."""

    def __init__(
        self, temp: float | None = 30.0, speeds=None, froms=None, limited: int = 0, fail: bool = False
    ) -> None:
        self.calls = 0
        self.temp = temp
        self.speeds = speeds
        self.froms = froms
        self.limited = limited  # how many calls answer 429 before one works
        self.fail = fail

    def __call__(self, points, start, end):  # noqa: ANN001
        self.calls += 1
        if self.fail:
            raise WeatherUnavailable("The weather service could not be reached.")
        if self.limited > 0:
            self.limited -= 1
            raise RateLimited("The weather service asked for a pause (too many calls).")
        n = (end - start).days + 1
        speeds = self.speeds or [12.0] * n
        froms = self.froms or [90.0] * n
        return [
            {
                "temperature_2m_mean": [self.temp] * n,
                "wind_speed_10m_mean": speeds[:n],
                "wind_direction_10m_dominant": froms[:n],
            }
            for _ in points
        ]


class Clock:
    def __init__(self, now: float = 1_800_000_000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def service(fetch: Fetch, tmp_path=None, clock: Clock | None = None) -> tuple[MonthFieldService, list[float]]:  # noqa: ANN001
    pauses: list[float] = []
    return MonthFieldService(
        fetch=fetch, clock=clock or Clock(), cache_dir=tmp_path, sleep=pauses.append
    ), pauses


def test_the_month_is_asked_on_the_same_lattice_as_the_live_field() -> None:
    fetch = Fetch()
    svc, _ = service(fetch)
    field = svc.month_field(2015, 10, TODAY)
    assert [(p.lat, p.lon) for p in field.points] == live_points()
    assert field.step_deg == 3.0 and field.days_requested == 31
    assert fetch.calls == -(-len(live_points()) // 50)  # one request per chunk of 50 points


def test_the_means_and_the_mean_flow_of_the_month() -> None:
    svc, _ = service(Fetch(temp=28.0))
    point = svc.month_field(2015, 10, TODAY).points[0]
    assert point.temperature_c == 28.0 and point.wind_speed_kmh == 12.0
    assert point.wind_from_deg == 90.0 and point.wind_flow_kmh == 12.0  # steady wind: the flow is the speed


def test_a_wind_that_keeps_changing_has_a_smaller_flow_than_its_speed() -> None:
    froms = [0.0, 180.0] * 16  # north then south, day after day
    svc, _ = service(Fetch(froms=froms, speeds=[10.0] * 31))
    point = svc.month_field(2015, 10, TODAY).points[0]
    assert point.wind_speed_kmh == 10.0
    assert (
        point.wind_flow_kmh is not None and point.wind_flow_kmh < 1.0
    )  # the month has no mean flow to speak of


def test_a_month_that_ended_long_ago_is_stored_for_good_on_disk(tmp_path) -> None:  # noqa: ANN001
    first_fetch = Fetch()
    first, _ = service(first_fetch, tmp_path)
    first.month_field(2015, 10, TODAY)
    assert (tmp_path / "era5-2015-10.json").exists()
    second_fetch = Fetch()
    clock = Clock(1_800_000_000.0 + 400 * 86400)  # a year later, on another process
    second, _ = service(second_fetch, tmp_path, clock)
    field = second.month_field(2015, 10, date(2027, 12, 20))
    assert second_fetch.calls == 0 and len(field.points) == len(live_points())  # no new call, for good


def test_a_recent_month_is_kept_only_a_few_hours(tmp_path) -> None:  # noqa: ANN001
    fetch, clock = Fetch(), Clock()
    svc, _ = service(fetch, tmp_path, clock)
    svc.month_field(2026, 10, TODAY)  # ended two weeks ago: can still be revised
    calls = fetch.calls
    svc.month_field(2026, 10, TODAY)
    assert fetch.calls == calls  # inside the TTL
    clock.now += 7 * 3600
    svc.month_field(2026, 10, TODAY)
    assert fetch.calls > calls  # past it: asked again


def test_the_daily_budget_stops_new_months_but_not_stored_ones(tmp_path) -> None:  # noqa: ANN001
    fetch = Fetch()
    svc, _ = service(fetch, tmp_path)
    svc.month_field(2015, 10, TODAY)
    svc._spent = MONTH_DAILY_BUDGET  # the day's calls are used up
    with pytest.raises(MonthBudgetSpent):
        svc.month_field(2016, 3, TODAY)  # a new month cannot be asked
    assert svc.month_field(2015, 10, TODAY).points  # a stored one still can be read


def test_the_spending_survives_a_restart(tmp_path) -> None:  # noqa: ANN001
    clock = Clock()
    first, _ = service(Fetch(), tmp_path, clock)
    first.month_field(2015, 10, TODAY)
    second, _ = service(Fetch(), tmp_path, clock)
    second.month_field(2016, 3, TODAY)
    assert second._spent == 2 * len(live_points())


def test_a_429_is_retried_with_growing_pauses_and_then_works() -> None:
    fetch = Fetch(limited=2)
    svc, pauses = service(fetch)
    assert svc.month_field(2015, 10, TODAY).points
    assert pauses == [2.0, 5.0]


def test_a_service_that_keeps_refusing_is_an_error_not_an_invented_month() -> None:
    svc, pauses = service(Fetch(limited=99))
    with pytest.raises(RateLimited):
        svc.month_field(2015, 10, TODAY)
    assert pauses == [2.0, 5.0, 12.0]


def test_a_month_before_era5_or_in_the_future_is_out_of_range() -> None:
    svc, _ = service(Fetch())
    with pytest.raises(WeatherOutOfRange):
        svc.month_field(1900, 1, TODAY)
    with pytest.raises(WeatherOutOfRange):
        svc.month_field(2027, 1, TODAY)


def test_an_unreadable_file_is_ignored_and_the_month_is_asked_again(tmp_path) -> None:  # noqa: ANN001
    (tmp_path / "era5-2015-10.json").write_text("{not json")
    fetch = Fetch()
    svc, _ = service(fetch, tmp_path)
    assert svc.month_field(2015, 10, TODAY).points and fetch.calls > 0


@pytest.fixture
def client():
    app.state.month_field = MonthFieldService(
        fetch=Fetch(), clock=Clock(), cache_dir=None, sleep=lambda s: None
    )
    with TestClient(app) as c:
        yield c
    del app.state.month_field


def test_endpoint_shape_and_errors(client: TestClient) -> None:
    body = client.get("/api/weather/month", params={"year": 2015, "month": 10}).json()
    assert body["model"] == "era5" and "ERA5" in body["source"] and body["status"] == "ok"
    assert body["step_deg"] == 3.0 and len(body["points"]) == len(live_points())
    assert body["points"][0]["wind_flow_kmh"] == 12.0 and body["points"][0]["wind_from_deg"] == 90.0
    assert client.get("/api/weather/month", params={"year": 1900, "month": 1}).status_code == 422
    assert client.get("/api/weather/month", params={"year": 2015, "month": 13}).status_code == 422


def test_endpoint_503_when_the_budget_is_spent_and_502_when_the_service_is_down() -> None:
    spent = MonthFieldService(fetch=Fetch(), clock=Clock(), cache_dir=None, sleep=lambda s: None)
    spent._spent_day = "2027-01-15"
    spent._spent = MONTH_DAILY_BUDGET
    app.state.month_field = spent
    try:
        with TestClient(app) as c:
            assert c.get("/api/weather/month", params={"year": 2015, "month": 10}).status_code == 503
        app.state.month_field = MonthFieldService(fetch=Fetch(fail=True), clock=Clock(), cache_dir=None)
        with TestClient(app) as c:
            assert c.get("/api/weather/month", params={"year": 2015, "month": 10}).status_code == 502
    finally:
        del app.state.month_field
