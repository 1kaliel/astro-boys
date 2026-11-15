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

# Layers of the map. "harmonized" is the VIIRS-equivalent count of the calendar (MODIS months estimated on the VIIRS
# scale); the others are the native filtered counts of one satellite, never added together (docs/data-dictionary.md).
SENSOR_COLUMNS = {
    "harmonized": "count_harmonized",
    "aqua": "raw_aqua",
    "terra": "raw_terra",
    "snpp": "raw_snpp",
    "n20": "raw_n20",
}


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


def map_breaks(period: str, sensor: str = "harmonized") -> list[float]:
    """Class limits for the map, identical for every month: quantiles of all positive cell-month values.

    A fixed scale keeps months comparable (a quiet February looks quiet) and cannot collapse when a month is
    nearly uniform across cells, as low-season background estimates are.
    """
    folder = _calendar_folder()
    stamp = max((p.stat().st_mtime for p in folder.rglob("*.parquet")), default=0.0)
    return list(_map_breaks(calendar_glob(), period, stamp, SENSOR_COLUMNS[sensor]))


@lru_cache(maxsize=32)
def _map_breaks(glob: str, period: str, stamp: float, column: str = "count_harmonized") -> tuple[float, ...]:
    # `stamp` (newest file time) is only part of the cache key: new data files give new breaks.
    quantiles = ", ".join(str(q) for q in MAP_QUANTILES)
    # `column` comes from SENSOR_COLUMNS, never from the request.
    query = f"""SELECT quantile_cont({column}, [{quantiles}])
                FROM read_parquet('{glob}', hive_partitioning = true)
                WHERE period = ? AND {column} > 0"""
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


def cells_for_month(year: int | None, month: int | None, period: str, sensor: str = "harmonized") -> dict:
    """Values per L2 cell for one month (the map). Geometry is derived from the cell ID by the client.

    Without a year and month, the most recent month in the data is used. `sensor` picks the layer: the harmonized
    VIIRS-equivalent count (default) or the native count of one satellite; a native layer has no estimated cells and
    leaves out the cells the satellite had no data for (null is not zero).
    """
    if sensor not in SENSOR_COLUMNS:
        raise ValueError(f"Unknown sensor {sensor!r}")
    column = SENSOR_COLUMNS[sensor]
    native = sensor != "harmonized"
    has_value = f"AND {column} IS NOT NULL" if native else ""
    estimated = "false" if native else "is_estimated"
    query = f"""
        SELECT cell_l2, {column}, {estimated}, is_partial, model_version
        FROM {_source()}
        WHERE year = ? AND month = ? AND period = ? {has_value}
        ORDER BY cell_l2
    """
    with duckdb.connect() as con:
        if year is None or month is None:
            latest_query = f"""SELECT year, month FROM {_source()} WHERE period = ? {has_value}
                               ORDER BY year DESC, month DESC LIMIT 1"""
            latest = con.execute(latest_query, [period]).fetchone()
            if latest is None:
                raise DataNotFoundError(f"calendar/v1 has no rows for this period and layer ({sensor})")
            year, month = latest
        rows = con.execute(query, [year, month, period]).fetchall()
    model_version = rows[0][4] if rows else None
    return {
        "year": year,
        "month": month,
        "period": period,
        "sensor": sensor,
        "model_version": model_version,
        "simulated": is_simulated(model_version),
        "breaks": map_breaks(period, sensor),
        "cells": [
            {"id": cell, "value": value, "estimated": estimated, "partial": partial}
            for cell, value, estimated, partial, _ in rows
        ],
    }
