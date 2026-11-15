from fastapi.testclient import TestClient

from astro_dashboard.main import app


def test_favicon_ico_redirects_to_the_svg_icon() -> None:
    response = TestClient(app).get("/favicon.ico", follow_redirects=False)
    assert response.status_code == 301
    assert response.headers["location"] == "/favicon.svg"


def test_healthz_returns_ok() -> None:
    assert TestClient(app).get("/api/healthz").json() == {"status": "ok"}  # reachable on a run.app URL
    response = TestClient(app).get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
