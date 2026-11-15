"""Weather context (ERA5 via Open-Meteo): point selection, area means, missing days, and the endpoint,
with a fake service."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from astro_dashboard.calendar import Bounds
from astro_dashboard.main import app
from astro_dashboard.weather import (
    MAX_POINTS,
    WeatherOutOfRange,
    WeatherService,
    WeatherUnavailable,
    era5_points,
    summarize,
)

# ERA5 grid points inside: lat -10 and -9.75, lon -40.25 and -40 (the edges -40.4/-39.9/-10.1/-9.6 are not
# on the grid).
BOX = {"west": -40.4, "south": -10.1, "east": -39.9, "north": -9.6}


def days(n: int, value: float | None) -> list[float | None]:
    return [value] * n


def test_points_are_the_era5_grid_points_inside_the_box() -> None:
    total, points = era5_points(Bounds(west=-40.4, south=-10.1, east=-39.9, north=-9.6))
    assert sorted({lat for lat, _ in points}) == [-10.0, -9.75]
    assert sorted({lon for _, lon in points}) == [-40.25, -40.0]
    assert total == 4


def test_a_box_smaller_than_the_grid_takes_the_nearest_point() -> None:
    # The centre (-9.85, -40.15) is nearest to the grid point (-10.0, -40.25) by rounding each axis.
    total, points = era5_points(Bounds(west=-40.2, south=-9.9, east=-40.1, north=-9.8))
    assert total == 1
    assert points == [(-9.75, -40.25)] or points == [(-10.0, -40.25)]


def test_a_large_box_is_sampled_and_says_so() -> None:
    total, points = era5_points(Bounds(west=-48.8, south=-18.4, east=-34.7, north=-1.0))
    assert total > 3000 and len(points) <= MAX_POINTS
    assert all(-18.4 <= lat <= -1.0 and -48.8 <= lon <= -34.7 for lat, lon in points)


def test_means_skip_missing_days_and_never_count_them_as_zero() -> None:
    daily = [
        {
            "temperature_2m_mean": [30.0, 32.0, None, None],
            "wind_speed_10m_mean": [10.0, 20.0, None, None],
            "wind_direction_10m_dominant": [90.0, 90.0, None, None],
        }
    ]
    s = summarize(daily, date(2026, 11, 1), date(2026, 11, 4), 2026, 11, points_in_area=1)
    assert s.temperature_mean_c == 31.0 and s.wind_speed_mean_kmh == 15.0
    assert s.days_available == 2 and s.days_requested == 4
    assert s.available_through == date(2026, 11, 2)


def test_wind_direction_is_where_the_wind_comes_from() -> None:
    east = summarize(
        [
            {
                "temperature_2m_mean": [25.0],
                "wind_speed_10m_mean": [12.0],
                "wind_direction_10m_dominant": [90.0],
            }
        ],
        date(2026, 1, 1),
        date(2026, 1, 1),
        2026,
        1,
        1,
    )
    assert east.wind_direction_from_deg == 90.0 and east.wind_direction_from == "E"
    assert east.wind_direction_steadiness == 1.0
    # Opposite winds cancel: no prevailing direction is invented.
    opposite = summarize(
        [
            {
                "temperature_2m_mean": [25.0, 25.0],
                "wind_speed_10m_mean": [10.0, 10.0],
                "wind_direction_10m_dominant": [0.0, 180.0],
            }
        ],
        date(2026, 1, 1),
        date(2026, 1, 2),
        2026,
        1,
        1,
    )
    assert opposite.wind_direction_steadiness is not None and opposite.wind_direction_steadiness < 0.01


def test_no_values_at_all_is_not_zero() -> None:
    s = summarize(
        [
            {
                "temperature_2m_mean": [None, None],
                "wind_speed_10m_mean": [None, None],
                "wind_direction_10m_dominant": [None, None],
            }
        ],
        date(2026, 11, 10),
        date(2026, 11, 11),
        2026,
        11,
        1,
    )
    assert s.temperature_mean_c is None and s.wind_speed_mean_kmh is None and s.days_available == 0


class FakeFetch:
    def __init__(self, temp: float | None = 30.0, fail: bool = False) -> None:
        self.calls = 0
        self.temp = temp
        self.fail = fail
        self.last: tuple | None = None

    def __call__(self, points, start, end):  # noqa: ANN001
        self.calls += 1
        self.last = (list(points), start, end)
        if self.fail:
            raise WeatherUnavailable("The weather service could not be reached.")
        n = (end - start).days + 1
        return [
            {
                "temperature_2m_mean": days(n, self.temp),
                "wind_speed_10m_mean": days(n, 15.0),
                "wind_direction_10m_dominant": days(n, 45.0),
            }
            for _ in points
        ]


@pytest.fixture
def client():
    fake = FakeFetch()
    app.state.weather = WeatherService(fetch=fake, clock=lambda: 1000.0)
    app.state.fake = fake
    with TestClient(app) as c:
        yield c
    del app.state.weather


def test_endpoint_returns_the_summary_with_its_source(client: TestClient) -> None:
    r = client.get("/api/weather", params={"year": 2020, "month": 10, **BOX})
    assert r.status_code == 200
    body = r.json()
    assert body["model"] == "era5" and "ERA5" in body["source"]
    assert body["status"] == "ok" and body["days_available"] == 31 == body["days_requested"]
    assert body["temperature_mean_c"] == 30.0 and body["wind_direction_from"] == "NE"
    assert body["points_in_area"] == 4 and body["points_used"] == 4


def test_a_second_request_for_the_same_area_and_month_uses_the_cache(client: TestClient) -> None:
    params = {"year": 2020, "month": 10, **BOX}
    client.get("/api/weather", params=params)
    client.get("/api/weather", params=params)
    assert app.state.fake.calls == 1


def test_the_current_month_is_asked_up_to_today_and_is_partial(client: TestClient, monkeypatch) -> None:
    class Day(date):
        @classmethod
        def today(cls):  # noqa: ANN206
            return date(2026, 11, 14)

    monkeypatch.setattr("astro_dashboard.weather.date", Day)
    r = client.get("/api/weather", params={"year": 2026, "month": 11, **BOX})
    body = r.json()
    assert body["end"] == "2026-11-14" and body["days_requested"] == 14
    assert body["status"] == "partial"


def test_the_service_being_down_is_a_502_not_a_made_up_number(client: TestClient) -> None:
    app.state.weather = WeatherService(fetch=FakeFetch(fail=True))
    r = client.get("/api/weather", params={"year": 2020, "month": 10, **BOX})
    assert r.status_code == 502


def test_a_month_before_era5_or_in_the_future_is_rejected(client: TestClient) -> None:
    assert client.get("/api/weather", params={"year": 1900, "month": 1, **BOX}).status_code == 422
    assert client.get("/api/weather", params={"year": 2999, "month": 1, **BOX}).status_code == 422
    assert client.get("/api/weather", params={"year": 2020, "month": 13, **BOX}).status_code == 422
    bad = {"west": -39.0, "south": -10.0, "east": -40.0, "north": -9.0}
    assert client.get("/api/weather", params={"year": 2020, "month": 1, **bad}).status_code == 422


def test_out_of_range_is_its_own_error() -> None:
    service = WeatherService(fetch=FakeFetch())
    with pytest.raises(WeatherOutOfRange):
        service.month_summary(Bounds(-40.4, -10.1, -39.9, -9.6), 2026, 12, today=date(2026, 11, 14))


def test_grid_uses_a_sub_grid_of_era5_and_stays_small() -> None:
    from astro_dashboard.weather import GRID_MAX_POINTS, grid_points

    step, points = grid_points(Bounds(west=-48.8, south=-18.4, east=-34.7, north=-1.0))
    assert step == 1.0 and 0 < len(points) <= GRID_MAX_POINTS
    assert all(lat == round(lat) and lon == round(lon) for lat, lon in points)  # multiples of 1 degree
    step, points = grid_points(Bounds(west=-40.4, south=-10.1, east=-39.9, north=-9.6))
    assert step == 0.25 and len(points) == 4  # a small box keeps the full 0.25 degree grid


def test_grid_endpoint_returns_one_mean_per_point_with_its_status(client: TestClient) -> None:
    params = {"year": 2020, "month": 10, "west": -45.0, "south": -12.0, "east": -42.0, "north": -10.0}
    r = client.get("/api/weather/grid", params=params)
    assert r.status_code == 200
    body = r.json()
    assert body["model"] == "era5" and body["status"] == "ok"
    assert body["step_deg"] == 0.25 or body["step_deg"] == 0.5 or body["step_deg"] == 1.0
    assert len(body["points"]) > 0
    first = body["points"][0]
    assert (
        first["temperature_c"] == 30.0 and first["wind_speed_kmh"] == 15.0 and first["wind_from_deg"] == 45.0
    )
    assert app.state.fake.calls == -(-len(body["points"]) // 50)  # one request per chunk of 50 points


def test_grid_a_missing_point_is_none_not_zero(client: TestClient) -> None:
    app.state.weather = WeatherService(fetch=FakeFetch(temp=None))
    params = {"year": 2020, "month": 10, "west": -45.0, "south": -12.0, "east": -42.0, "north": -10.0}
    body = client.get("/api/weather/grid", params=params).json()
    assert body["points"][0]["temperature_c"] is None and body["points"][0]["wind_speed_kmh"] == 15.0
