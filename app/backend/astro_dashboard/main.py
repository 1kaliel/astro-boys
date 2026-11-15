"""FastAPI entry point. One process serves the API and the built frontend, on $PORT.

Layout inside the container (see app/Dockerfile):
  /app/backend/astro_dashboard/main.py   this file
  /app/frontend/dist/                    output of `npm run build`

Locally, `FRONTEND_DIST` defaults to app/frontend/dist, so run `npm run build` first or
use the Vite dev server with its proxy (see app/README.md).
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

APP_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", APP_DIR / "frontend" / "dist"))

app = FastAPI(
    title="Astro Boys dashboard",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness probe for Cloud Run and for the local container check."""
    return {"status": "ok"}


# Mounted last, so API routes always win over static files.
# Skipped when the frontend has not been built (e.g. in backend-only tests).
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
