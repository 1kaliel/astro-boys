# Dashboard container: one image serves the API and the built frontend on $PORT (Cloud Run contract).
# Build from this folder: docker build -t astro-dashboard app/

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

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH" \
    FRONTEND_DIST=/app/frontend/dist \
    PORT=8080

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/ ./backend/
COPY --from=frontend /build/dist ./frontend/dist

# Stateless and read-only at runtime; never run as root.
USER 10001
EXPOSE 8080

# Shell form so ${PORT} is expanded at start (Cloud Run sets PORT).
CMD ["sh", "-c", "exec uvicorn --app-dir /app/backend astro_dashboard.main:app --host 0.0.0.0 --port ${PORT}"]
