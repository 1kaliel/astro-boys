"""Map data (task D3): values per 0.25 degree cell for one month, read from processed/calendar/v1.

The area calendar (cells of an area summed, median, anomalies) lives in calendar.py and api.py. This
module only serves the map: one month, every cell, plus fixed class limits so months stay comparable.

An absent row is "no detection by the source satellite", not "no fire": the map leaves such cells empty.

ASTRO_DATA_ROOT points at the folder that holds processed/; ASTRO_DATASET_VERSION picks the calendar
folder (default "v1"). For the official simulated table (`uv run astro-fire mock-calendar`) use "mock".
"""

from __future__ import annotations

import math
import os
import re
from functools import lru_cache
from pathlib import Path

import duckdb

MAP_QUANTILES = (0.5, 0.7, 0.8, 0.9, 0.95, 0.98)
Z_90 = 1.645

# Native series: one satellite at a time (MODIS and VIIRS are different instruments, and the satellites of one
# instrument are never added together either). column = the calendar/v1 column that holds the native count.
SATELLITES = {
    "Aqua": ("raw_aqua", "MODIS", "Aqua MODIS"),
    "Terra": ("raw_terra", "MODIS", "Terra MODIS"),
    "SNPP": ("raw_snpp", "VIIRS", "S-NPP VIIRS"),
    "N20": ("raw_n20", "VIIRS", "NOAA-20 VIIRS"),
}
SERIES = ("harmonized", "modis", "viirs")


class BadSeriesError(ValueError):
    """The satellite asked for does not belong to the series asked for."""


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


def raw_breaks(column: str, period: str) -> list[float]:
    """Class limits of a native column: quantiles of its positive cell-month values."""
    folder = _calendar_folder()
    stamp = max((p.stat().st_mtime for p in folder.rglob("*.parquet")), default=0.0)
    return list(_raw_breaks(calendar_glob(), column, period, stamp))


@lru_cache(maxsize=32)
def _raw_breaks(glob: str, column: str, period: str, stamp: float) -> tuple[float, ...]:
    quantiles = ", ".join(str(q) for q in MAP_QUANTILES)
    # `column` comes from the SATELLITES table above, never from the request.
    query = f"""SELECT quantile_cont({column}, [{quantiles}])
                FROM read_parquet('{glob}', hive_partitioning = true)
                WHERE period = ? AND {column} > 0"""
    with duckdb.connect() as con:
        row = con.execute(query, [period]).fetchone()
    out: list[float] = []
    for value in (row[0] or []) if row else []:
        rounded = round(float(value), 1)
        if not out or rounded > out[-1]:
            out.append(rounded)
    return tuple(out)


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


def cells_for_month(
    year: int | None, month: int | None, period: str, series: str = "harmonized", satellite: str | None = None
) -> dict:
    """Values per L2 cell for one month (the map). Geometry is derived from the cell ID by the client.

    Without a year and month, the most recent month in the data is used. `series` picks what the values are:
    the harmonized VIIRS-equivalent count (default), or the native count of ONE satellite of MODIS or VIIRS.
    """
    if series not in SERIES:
        raise BadSeriesError(f"series must be one of {', '.join(SERIES)}")
    if satellite is not None and (satellite not in SATELLITES or series == "harmonized"):
        raise BadSeriesError("satellite applies to the modis and viirs series only")
    if satellite is not None and SATELLITES[satellite][1].lower() != series:
        raise BadSeriesError(f"{satellite} is not a {series.upper()} satellite")
    with duckdb.connect() as con:
        if year is None or month is None:
            latest_query = f"""SELECT year, month FROM {_source()} WHERE period = ?
                               ORDER BY year DESC, month DESC LIMIT 1"""
            latest = con.execute(latest_query, [period]).fetchone()
            if latest is None:
                raise DataNotFoundError("calendar/v1 has no rows for this period")
            year, month = latest
        if series == "harmonized":
            return _harmonized(con, year, month, period)
        return _native(con, year, month, period, series, satellite)


def _harmonized(con, year: int, month: int, period: str) -> dict:
    rows = con.execute(
        f"""SELECT cell_l2, count_harmonized, is_estimated, is_partial, model_version, var_harmonized
            FROM {_source()} WHERE year = ? AND month = ? AND period = ? ORDER BY cell_l2""",
        [year, month, period],
    ).fetchall()
    model_version = rows[0][4] if rows else None
    cells = []
    for cell, value, estimated, partial, _, var in rows:
        item = {"id": cell, "value": value, "estimated": estimated, "partial": partial}
        # The 90% interval of one cell, for estimated cells only (an observed cell is exact).
        if estimated and value is not None and var is not None:
            spread = Z_90 * math.sqrt(max(var, 0.0))
            item["ci_low"], item["ci_high"] = max(0.0, value - spread), value + spread
        cells.append(item)
    return {
        "year": year,
        "month": month,
        "period": period,
        "model_version": model_version,
        "simulated": is_simulated(model_version),
        "breaks": map_breaks(period),
        "series": "harmonized",
        "satellite": None,
        "available_satellites": [],
        "coverage": "ok" if rows else "none",
        "reason": None,
        "cells": cells,
    }


def _native(con, year: int, month: int, period: str, series: str, satellite: str | None) -> dict:
    """Native counts of one satellite. Absent = that satellite had no record for the cell in the month."""
    instrument = series.upper()
    counts = con.execute(
        f"""SELECT count(raw_aqua), count(raw_terra), count(raw_snpp), count(raw_n20),
                   any_value(model_version)
            FROM {_source()} WHERE year = ? AND month = ? AND period = ?""",
        [year, month, period],
    ).fetchone()
    have = dict(zip(("Aqua", "Terra", "SNPP", "N20"), counts[:4], strict=True))
    available = [sat for sat, n in have.items() if n and SATELLITES[sat][1] == instrument]
    model_version = counts[4]
    base = {
        "year": year,
        "month": month,
        "period": period,
        "model_version": model_version,
        "simulated": is_simulated(model_version),
        "series": series,
        "available_satellites": available,
    }
    chosen = (
        satellite if satellite in available else (available[0] if available and satellite is None else None)
    )
    if chosen is None:
        reason = (
            f"{SATELLITES[satellite][2]} has no data in this month."
            if satellite
            else f"{instrument} has no data in this month."
        )
        return {
            **base,
            "satellite": satellite,
            "breaks": [],
            "coverage": "none",
            "reason": reason,
            "cells": [],
        }
    column = SATELLITES[chosen][0]
    rows = con.execute(
        f"""SELECT cell_l2, {column}, is_partial FROM {_source()}
            WHERE year = ? AND month = ? AND period = ? AND {column} IS NOT NULL ORDER BY cell_l2""",
        [year, month, period],
    ).fetchall()
    return {
        **base,
        "satellite": chosen,
        "breaks": raw_breaks(column, period),
        "coverage": "ok",
        "reason": None,
        "cells": [
            {"id": cell, "value": value, "estimated": False, "partial": partial, "satellite": chosen}
            for cell, value, partial in rows
        ],
    }
