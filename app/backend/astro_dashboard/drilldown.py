"""AGGS drill-down (task D11): the native detections of one L2 cell split into its 16 L3 cells, with the 3 x 3
block of L2 cells around it for context, for one month. Read from `processed/hotspots/v1` (hotspots.py).

Grid (docs/spec/harmonization.md section 4): L1 1 degree, L2 0.25, L3 0.0625. An L2 id is
`G<lat+90 3d><lon+180 3d>.<k 2d>` with k = row * 4 + col + 1, rows from the south, columns from the west;
an L3 id is the L2 id plus `.NN` by the same rule inside the L2 cell.

Rules:

* Native detections only: L3 never shows harmonized values (they exist at L2 and coarser only).
* One satellite: the month's source satellite, the one the calendar's `raw_source` counts (Aqua MODIS before
  the VIIRS era, S-NPP VIIRS after, NOAA-20 in the months the calendar takes from it). Satellites and
  instruments are never added together.
* Same rows as the calendar: local solar month (`date_local`), `passes_main_filter`, optional day or night.
* Only the partition of that instrument and local solar year is read. If it is missing the answer is an error
  (HotspotsUnavailable), not zero detections: missing is never zero.
* Stop rules: L3 is the deepest level (an L3 id is refused), and a cell with fewer than `MIN_DETECTIONS`
  detections is not subdivided.
"""

from __future__ import annotations

import calendar as _calendar
import re
from dataclasses import dataclass
from datetime import date

import duckdb

from astro_dashboard import hotspots

MIN_DETECTIONS = 5
L2_PER_DEGREE = 4
LAT_ROWS = 180 * L2_PER_DEGREE  # L2 rows from the south pole
LON_COLS = 360 * L2_PER_DEGREE  # L2 columns from the antimeridian
INSTRUMENTS = {"Aqua": "MODIS", "Terra": "MODIS", "SNPP": "VIIRS", "N20": "VIIRS", "N21": "VIIRS"}

_L2_ID = re.compile(r"^G(\d{3})(\d{3})\.(\d{2})$")
_DEEPER_ID = re.compile(r"^G\d{6}(\.\d{2}){2,}$")


class NotAnL2Cell(ValueError):
    """The id is not a valid L2 cell id (an L3 id is refused: L3 is the deepest level)."""


@dataclass(frozen=True)
class Drilldown:
    cell: str
    satellite: str
    instrument: str
    neighbors: list[tuple[str, int]]
    l3: list[tuple[str, int]]
    total: int
    subdivided: bool


def l2_index(cell: str) -> tuple[int, int]:
    """(row, column) of an L2 cell in the global 0.25 degree grid, counted from (-90, -180)."""
    match = _L2_ID.match(cell)
    if not match:
        if _DEEPER_ID.match(cell):
            raise NotAnL2Cell(f"{cell} is an L3 cell: L3 is the deepest level of the drill-down.")
        raise NotAnL2Cell(f"Not an L2 cell id: {cell!r}. Expected G<3 digits><3 digits>.<01..16>.")
    lat, lon, k = int(match[1]), int(match[2]), int(match[3]) - 1
    if lat >= 180 or lon >= 360 or not 0 <= k < 16:
        raise NotAnL2Cell(f"Not an L2 cell id: {cell!r} is outside the grid.")
    return lat * L2_PER_DEGREE + k // 4, lon * L2_PER_DEGREE + k % 4


def l2_id(row: int, col: int) -> str:
    """Id of the L2 cell at (row, column) of the global grid."""
    return f"G{row // 4:03d}{col // 4:03d}.{row % 4 * 4 + col % 4 + 1:02d}"


def neighbors(cell: str) -> list[str]:
    """The 3 x 3 block of L2 cells centred on `cell` (the cell itself included), rows from the south and
    columns from the west, like k. Crosses 1 degree boundaries; wraps at the antimeridian; rows beyond a pole
    are left out, so every id is valid."""
    row, col = l2_index(cell)
    return [
        l2_id(r, (col + dc) % LON_COLS)
        for r in (row - 1, row, row + 1)
        if 0 <= r < LAT_ROWS
        for dc in (-1, 0, 1)
    ]


def _partition_source(root: str, instrument: str, year: int) -> str:
    """Only the files of one instrument and year: a short listing on gs://, and a partition that is not there
    is an error (HotspotsUnavailable), never zero detections."""
    glob = f"{root}/instrument={instrument}/year={year}/*.parquet".replace("'", "''")
    return f"read_parquet('{glob}', hive_partitioning = true)"


def drilldown(
    cell: str,
    year: int,
    month: int,
    satellite: str,
    period: str = "ALL",
    root: str | None = None,
    min_frp: float | None = None,
    min_confidence: str = "l",
) -> Drilldown:
    """Native detection counts of the 3 x 3 block around `cell` and of the L3 cells of `cell`, for one month
    and one satellite. One read of the month's partition, grouped by L2 and L3 cell."""
    block = neighbors(cell)
    instrument = INSTRUMENTS.get(satellite)
    if instrument is None:
        raise ValueError(f"Unknown satellite {satellite!r}")
    root = root or hotspots.hotspots_root()
    first = date(year, month, 1)
    last = date(year, month, _calendar.monthrange(year, month)[1])
    clauses = [
        "instrument = ?",  # already the partition read; kept so the filter says what it counts
        "year = ?",
        "date_local BETWEEN ? AND ?",
        "satellite = ?",  # never two satellites, even of the same instrument
        "passes_main_filter",
        "list_contains(?, cell_l2)",
    ]
    params: list = [instrument, year, first, last, satellite, block]
    if period != "ALL":
        clauses.append("daynight = ?")
        params.append(period)
    extra, extra_params = hotspots.quality_clauses(min_frp, min_confidence)
    clauses += extra
    params += extra_params
    sql = (
        f"SELECT cell_l2, cell_l3, count(*) FROM {_partition_source(root, instrument, year)} "
        f"WHERE {' AND '.join(clauses)} GROUP BY cell_l2, cell_l3"
    )
    con = hotspots._connect(root)
    try:
        rows = con.execute(sql, params).fetchall()
    except duckdb.Error as error:
        raise hotspots.HotspotsUnavailable(f"hotspots/v1 could not be read: {error}") from error
    finally:
        con.close()

    per_l2 = dict.fromkeys(block, 0)
    per_l3: dict[str, int] = {}
    for l2, l3, n in rows:
        per_l2[l2] += int(n)
        if l2 == cell:
            per_l3[l3] = per_l3.get(l3, 0) + int(n)
    total = per_l2[cell]
    subdivided = total >= MIN_DETECTIONS
    return Drilldown(
        cell=cell,
        satellite=satellite,
        instrument=instrument,
        neighbors=[(c, per_l2[c]) for c in block],
        l3=sorted(per_l3.items()) if subdivided else [],
        total=total,
        subdivided=subdivided,
    )
