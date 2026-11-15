"""Map data (task D3): values per 0.25 degree cell for one month, read from processed/calendar/v1.

The area calendar (cells of an area summed, median, anomalies) lives in calendar.py and api.py. This
module only serves the map: one month, every cell, plus fixed class limits so months stay comparable.

An absent row is "no detection by the source satellite", not "no fire": the map leaves such cells empty.

ASTRO_DATA_ROOT points at the folder that holds processed/; ASTRO_DATASET_VERSION picks the calendar
folder (default "v1"). For the official simulated table (`uv run astro-fire mock-calendar`) use "mock".
"""

from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path

import duckdb

MAP_QUANTILES = (0.5, 0.7, 0.8, 0.9, 0.95, 0.98)


class DataNotFoundError(RuntimeError):
    """The calendar table is not where ASTRO_DATA_ROOT says it is."""


def _calendar_folder() -> Path:
    root = os.environ.get("ASTRO_DATA_ROOT", "data")
    version = os.environ.get("ASTRO_DATASET_VERSION", "v1")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", version) or version in {".", ".."}:
        raise DataNotFoundError(f"invalid ASTRO_DATASET_VERSION: {version!r}")
    folder = Path(root) / "processed" / "calendar" / version
    if not folder.is_dir():
        raise DataNotFoundError(f"calendar/{version} not found under ASTRO_DATA_ROOT ({folder})")
    return folder


def calendar_glob() -> str:
    return (_calendar_folder() / "**" / "*.parquet").as_posix().replace("'", "''")


def _source() -> str:
    return f"read_parquet('{calendar_glob()}', hive_partitioning = true)"


def map_breaks(period: str) -> list[float]:
    """Class limits for the map, identical for every month: quantiles of all positive cell-month values.

    A fixed scale keeps months comparable (a quiet February looks quiet) and cannot collapse when a month is
    nearly uniform across cells, as low-season background estimates are.
    """
    folder = _calendar_folder()
    stamp = max((p.stat().st_mtime for p in folder.rglob("*.parquet")), default=0.0)
    return list(_map_breaks(calendar_glob(), period, stamp))


@lru_cache(maxsize=32)
def _map_breaks(glob: str, period: str, stamp: float) -> tuple[float, ...]:
    # `stamp` (newest file time) is only part of the cache key: new data files give new breaks.
    quantiles = ", ".join(str(q) for q in MAP_QUANTILES)
    query = f"""SELECT quantile_cont(count_harmonized, [{quantiles}])
                FROM read_parquet('{glob}', hive_partitioning = true)
                WHERE period = ? AND count_harmonized > 0"""
    with duckdb.connect() as con:
        row = con.execute(query, [period]).fetchone()
    breaks: list[float] = []
    for value in (row[0] or []) if row else []:
        rounded = round(float(value), 1)
        if not breaks or rounded > breaks[-1]:  # strictly increasing, as the map's step expression needs
            breaks.append(rounded)
    return tuple(breaks)


def is_simulated(model_version: str | None) -> bool:
    return bool(model_version) and model_version.upper().startswith("MOCK")


def cells_for_month(year: int | None, month: int | None, period: str) -> dict:
    """Values per L2 cell for one month (the map). Geometry is derived from the cell ID by the client.

    Without a year and month, the most recent month in the data is used.
    """
    query = f"""
        SELECT cell_l2, count_harmonized, is_estimated, is_partial, model_version
        FROM {_source()}
        WHERE year = ? AND month = ? AND period = ?
        ORDER BY cell_l2
    """
    with duckdb.connect() as con:
        if year is None or month is None:
            latest_query = f"""SELECT year, month FROM {_source()} WHERE period = ?
                               ORDER BY year DESC, month DESC LIMIT 1"""
            latest = con.execute(latest_query, [period]).fetchone()
            if latest is None:
                raise DataNotFoundError("calendar/v1 has no rows for this period")
            year, month = latest
        rows = con.execute(query, [year, month, period]).fetchall()
    model_version = rows[0][4] if rows else None
    return {
        "year": year,
        "month": month,
        "period": period,
        "model_version": model_version,
        "simulated": is_simulated(model_version),
        "breaks": map_breaks(period),
        "cells": [
            {"id": cell, "value": value, "estimated": estimated, "partial": partial}
            for cell, value, estimated, partial, _ in rows
        ],
    }
