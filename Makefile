# Common commands. Run `make help`.
.PHONY: help setup test lint check smoke info ci

help:
	@echo "make setup   install the locked Python env (uv sync --group dev)"
	@echo "make test    run pytest"
	@echo "make lint    run ruff"
	@echo "make check   repo hygiene: no secrets, .env, credentials or data files"
	@echo "make smoke   CSV -> DuckDB -> partitioned Parquet -> manifest, on sample rows"
	@echo "make info    print resolved settings and storage layout"
	@echo "make ci      everything CI runs"

setup:
	uv sync --group dev

test:
	uv run pytest

lint:
	uv run ruff check src tests

check:
	./scripts/check_repo_hygiene.sh

smoke:
	uv run astro-fire smoke

info:
	uv run astro-fire info

ci: lint test check smoke
