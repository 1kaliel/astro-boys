"""Municipalities (IBGE) and their current feels-like temperature, with a fake fetcher and a fake clock."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from astro_dashboard.main import app
from astro_dashboard.municipalities import (
    BOUNDARY_TTL_SECONDS,
    WEATHER_DAILY_BUDGET,
    WEATHER_TTL_SECONDS,
    MunicipalityService,
    UnknownState,
    bounds_of,
    centroid,
)
from astro_dashboard.weather import WeatherUnavailable


def square(x: float, y: float, size: float = 1.0) -> dict:
    ring = [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]
    return {"type": "Polygon", "coordinates": [ring]}


class Fake:
    """IBGE and Open-Meteo answers for two municipalities."""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.fail_weather = False
        self.fail_ibge = False

    def __call__(self, url: str) -> object:
        self.calls.append(url.split("?")[0].split("/")[2] + ":" + url.split("?")[0].split("/")[-1])
        if "malhas" in url:
            if self.fail_ibge:
                raise WeatherUnavailable("A data service could not be reached.")
            return {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"codarea": "2300101"},
                        "geometry": square(-40.0, -5.0, 2.0),
                    },
                    {
                        "type": "Feature",
                        "properties": {"codarea": "2300200"},
                        "geometry": square(-38.0, -4.0),
                    },
                ],
            }
        if "localidades" in url:
            return [{"id": 2300101, "nome": "Abaiara"}, {"id": 2300200, "nome": "Acaraú"}]
        if self.fail_weather:
            raise WeatherUnavailable("The weather service could not be reached.")
        return [
            {
                "current": {
                    "time": "2026-11-15T07:30",
                    "apparent_temperature": 30.2,
                    "temperature_2m": 26.8,
                    "relative_humidity_2m": 78,
                    "wind_speed_10m": 12.3,
                }
            },
            {
                "current": {
                    "time": "2026-11-15T07:30",
                    "apparent_temperature": None,
                    "temperature_2m": 25.0,
                    "relative_humidity_2m": 80,
                    "wind_speed_10m": 9.0,
                }
            },
        ]


class Clock:
    def __init__(self) -> None:
        self.now = 1_800_000_000.0 - 1_800_000_000.0 % 86400  # 00:00 UTC

    def __call__(self) -> float:
        return self.now


def test_the_centroid_of_a_square_is_its_middle_and_the_biggest_polygon_wins() -> None:
    assert centroid(square(0, 0, 2)) == pytest.approx((1.0, 1.0))
    multi = {
        "type": "MultiPolygon",
        "coordinates": [square(10, 10, 0.1)["coordinates"], square(0, 0, 2)["coordinates"]],
    }
    assert centroid(multi) == pytest.approx((1.0, 1.0))  # not the tiny island


def test_bounds_cover_every_feature() -> None:
    features = [{"geometry": square(-40, -5, 2)}, {"geometry": square(-38, -4)}]
    assert bounds_of(features) == (-40.0, -5.0, -37.0, -3.0)


def test_boundaries_join_names_by_code_and_carry_the_centroid() -> None:
    service = MunicipalityService(fetch=Fake(), clock=Clock())
    geo = service.boundaries("ce")
    first = geo["features"][0]["properties"]
    assert first == {"code": "2300101", "name": "Abaiara", "lon": -39.0, "lat": -4.0}
    assert geo["state"]["name"] == "Ceará" and len(geo["features"]) == 2


def test_an_unknown_state_is_rejected() -> None:
    with pytest.raises(UnknownState):
        MunicipalityService(fetch=Fake(), clock=Clock()).boundaries("xx")


def test_boundaries_are_cached_for_a_week_and_survive_a_failing_service() -> None:
    fake, clock = Fake(), Clock()
    service = MunicipalityService(fetch=fake, clock=clock)
    service.boundaries("ce")
    n = len(fake.calls)
    service.boundaries("ce")
    assert len(fake.calls) == n  # cached
    clock.now += BOUNDARY_TTL_SECONDS + 1
    fake.fail_ibge = True
    assert service.boundaries("ce")["features"]  # the old copy, not an error


def test_weather_is_asked_once_for_every_municipality_and_cached() -> None:
    fake, clock = Fake(), Clock()
    service = MunicipalityService(fetch=fake, clock=clock)
    snap = service.weather("ce")
    assert [i.code for i in snap.items] == ["2300101", "2300200"]
    assert snap.items[0].apparent_temperature_c == 30.2 and snap.model_time == "2026-11-15T07:30"
    # A missing value stays missing: never zero.
    assert snap.items[1].apparent_temperature_c is None and snap.items[1].temperature_c == 25.0
    weather_calls = [c for c in fake.calls if "forecast" in c]
    service.weather("ce")
    assert [c for c in fake.calls if "forecast" in c] == weather_calls
    clock.now += WEATHER_TTL_SECONDS + 1
    service.weather("ce")
    assert len([c for c in fake.calls if "forecast" in c]) == len(weather_calls) + 1


def test_when_the_weather_service_fails_the_last_answer_is_flagged_stale() -> None:
    fake, clock = Fake(), Clock()
    service = MunicipalityService(fetch=fake, clock=clock)
    service.weather("ce")
    fake.fail_weather = True
    clock.now += WEATHER_TTL_SECONDS + 1
    stale = service.weather("ce")
    assert stale.stale and "could not be reached" in (stale.stale_reason or "") and stale.items


def test_with_no_answer_at_all_a_failure_is_an_error() -> None:
    fake = Fake()
    fake.fail_weather = True
    with pytest.raises(WeatherUnavailable):
        MunicipalityService(fetch=fake, clock=Clock()).weather("ce")


def test_the_daily_budget_stops_refreshes() -> None:
    fake, clock = Fake(), Clock()
    service = MunicipalityService(fetch=fake, clock=clock)
    service.weather("ce")
    # Spend what is left of today's budget, then the next refresh must be refused (stale), not made.
    service._spent["ce"] = (service._spent["ce"][0], WEATHER_DAILY_BUDGET)
    clock.now += WEATHER_TTL_SECONDS + 1
    calls = len(fake.calls)
    over = service.weather("ce")
    assert over.stale and "budget" in (over.stale_reason or "")
    assert len(fake.calls) == calls  # no call was made


@pytest.fixture
def client():
    app.state.municipalities = MunicipalityService(fetch=Fake(), clock=Clock())
    with TestClient(app) as c:
        yield c
    del app.state.municipalities


def test_endpoints(client: TestClient) -> None:
    geo = client.get("/api/municipalities/ce").json()
    assert geo["type"] == "FeatureCollection" and geo["state"]["uf"] == "ce"
    weather = client.get("/api/municipalities/ce/weather").json()
    assert weather["items"][0]["apparent_temperature_c"] == 30.2 and weather["stale"] is False
    assert "not station readings" in weather["source"]
    assert client.get("/api/municipalities/xx").status_code == 404
    assert client.get("/api/municipalities/xx/weather").status_code == 404


def test_fetch_json_unpacks_a_gzip_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    """IBGE compresses its answers whether or not the client asks for it."""
    import gzip
    import io
    import json

    from astro_dashboard import municipalities

    payload = {"ok": True, "nome": "Acaraú"}

    class Response(io.BytesIO):
        def __enter__(self) -> Response:
            return self

        def __exit__(self, *args: object) -> None:
            self.close()

    for body in (gzip.compress(json.dumps(payload).encode()), json.dumps(payload).encode()):
        monkeypatch.setattr(municipalities.urllib.request, "urlopen", lambda *a, _b=body, **k: Response(_b))
        assert municipalities.fetch_json("https://example.test/x") == payload
