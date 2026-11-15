"""FastAPI entry point. One process serves the API and the built frontend, on $PORT.

Layout inside the container (see app/Dockerfile):
  /app/backend/astro_dashboard/main.py   this file
  /app/frontend/dist/                    output of `npm run build`

Locally, `FRONTEND_DIST` defaults to app/frontend/dist, so run `npm run build` first or
use the Vite dev server with its proxy (see app/README.md).
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from astro_dashboard import cells
from astro_dashboard.api import load_store_from_env, router

APP_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", APP_DIR / "frontend" / "dist"))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Read-only data, loaded once. A missing calendar does not stop the app: /healthz must still answer.
    app.state.calendar = load_store_from_env()
    yield


app = FastAPI(
    title="Astro Boys dashboard",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.include_router(router)


@app.get("/healthz")
@app.get("/api/healthz", tags=["meta"])
def healthz() -> dict[str, str]:
    """Liveness probe for the local container check, and the status the page shows.

    Use /api/healthz from outside: on a run.app URL Cloud Run keeps /healthz for itself and answers 404
    before the request reaches the container."""
    return {"status": "ok"}


@app.get("/api/cells", tags=["map"])
def api_cells(
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
    period: Literal["ALL", "D", "N"] = "ALL",
) -> dict:
    """VIIRS-equivalent hotspot counts per 0.25° cell for one month (the map); latest month by default."""
    try:
        return cells.cells_for_month(year, month, period)
    except cells.DataNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


# Mounted last, so API routes always win over static files.
# Skipped when the frontend has not been built (e.g. in backend-only tests).
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
