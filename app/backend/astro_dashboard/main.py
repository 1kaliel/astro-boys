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

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

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
app.include_router(router)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness probe for Cloud Run and for the local container check."""
    return {"status": "ok"}


# Mounted last, so API routes always win over static files.
# Skipped when the frontend has not been built (e.g. in backend-only tests).
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
