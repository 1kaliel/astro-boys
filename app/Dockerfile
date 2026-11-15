# Dashboard container: one image serves the API and the built frontend on $PORT (Cloud Run contract).
#
# The calendar is baked into the image (D8). It comes in as a named build context, never from git or app/:
#   docker build -t astro-dashboard \
#     --build-context calendar=data/processed/calendar/v1 --build-arg MODEL_VERSION=<model_version> app/
# deploy/cloudrun/deploy.sh does this. Only the calendar (~24 MB): hotspots/v1 (883 MB) stays in the bucket (D6).
# An image without data (skeleton checks only): docker build --build-arg ALLOW_NO_CALENDAR=1 app/

# Stage 0: the calendar files. Empty unless --build-context calendar=<folder> replaces this stage.
FROM scratch AS calendar

# Stage 1: build the single-page frontend.
FROM node:24-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: runtime. Python dependencies are locked by uv.lock; no dev tools in the image.
FROM python:3.12-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.12.12 /uv /usr/local/bin/uv

# model_version of the baked calendar (deploy.sh reads it from the Parquet); the build fails if they differ.
ARG MODEL_VERSION=""
ARG ALLOW_NO_CALENDAR=0
LABEL org.opencontainers.image.title="astro-dashboard" \
      astro.dataset="calendar/v1" \
      astro.model_version="${MODEL_VERSION}"

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH" \
    FRONTEND_DIST=/app/frontend/dist \
    ASTRO_DATA_ROOT=/app/data \
    ASTRO_DATASET_VERSION=v1 \
    ASTRO_MODEL_VERSION=${MODEL_VERSION} \
    PORT=8080

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY --from=calendar / ./data/processed/calendar/v1/
COPY backend/ ./backend/
COPY --from=frontend /build/dist ./frontend/dist

# Load the calendar the way the app will, check its model_version, record what was baked (/api/version).
RUN cd /app/backend && python -m astro_dashboard.bake --check /app/data \
      --expect-model-version "${MODEL_VERSION}" $( [ "${ALLOW_NO_CALENDAR}" = "1" ] && echo --allow-empty )

# Stateless and read-only at runtime; never run as root.
USER 10001
EXPOSE 8080

# Shell form so ${PORT} is expanded at start (Cloud Run sets PORT).
CMD ["sh", "-c", "exec uvicorn --app-dir /app/backend astro_dashboard.main:app --host 0.0.0.0 --port ${PORT}"]
