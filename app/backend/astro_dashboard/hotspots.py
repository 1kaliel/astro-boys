"""Native hotspots of an area and dates, as CSV (task D6), read from `processed/hotspots/v1`.

The source is `$ASTRO_HOTSPOTS_ROOT` (default `$ASTRO_DATA_ROOT/processed/hotspots/v1`). On Cloud Run it is
the bucket, `gs://<bucket>/astro/processed/hotspots/v1`, read with the service account through Application
Default Credentials (no key files); locally, a copy pulled with scripts/sync_data.sh, or the bucket after
`gcloud auth application-default login`. Only the calendar is baked into the image (D8); hotspots/v1 (~885 MB)
is not.

Rules:

* The area is the same set of 0.25 degree cells as the calendar (the cells that overlap the box, from the
  calendar's cell list), so a CSV adds up to the raw counts behind the calendar.
* Dates are the local solar date (`date_local`), like the calendar months; `year` is the partition key.
* By default only detections that pass the main filter (`passes_main_filter`: type 0, nominal or high
  confidence) are returned: those are the ones the calendar counts. `include_all` returns every row.
* A detection is a hotspot, not a fire; columns are as delivered by NASA FIRMS plus our provenance columns.
"""

from __future__ import annotations

import csv
import io
import os
import threading
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import duckdb

# Columns of the CSV, in this order (docs/data-dictionary.md section 2).
COLUMNS = (
    "hotspot_id",
    "acq_ts_utc",
    "date_local",
    "latitude",
    "longitude",
    "satellite",
    "instrument",
    "version",
    "daynight",
    "confidence_raw",
    "confidence_class",
    "type",
    "passes_main_filter",
    "frp_mw",
    "brightness_mir_k",
    "brightness_tir_k",
    "scan_km",
    "track_km",
    "cell_l2",
    "cell_l3",
    "country",
    "source_file",
)
DEFAULT_MAX_ROWS = 500_000
FETCH_ROWS = 20_000
# One export at a time: an instance has 1 GiB and the calendar already holds about 300 MiB.
_EXPORTS = threading.BoundedSemaphore(int(os.environ.get("ASTRO_CSV_CONCURRENCY") or 1))


class HotspotsUnavailable(RuntimeError):
    """hotspots/v1 is not where ASTRO_HOTSPOTS_ROOT says, or it cannot be read."""


class YearsNotAvailable(HotspotsUnavailable):
    """A local copy has none of the requested years: missing data, which must not read as zero detections."""


class TooManyRows(ValueError):
    def __init__(self, rows: int, max_rows: int) -> None:
        super().__init__(f"{rows:,} hotspots match; the limit is {max_rows:,}. Narrow the area or the years.")
        self.rows = rows
        self.max_rows = max_rows


class Busy(RuntimeError):
    """Another export is running on this instance."""


@dataclass(frozen=True)
class HotspotQuery:
    cells: tuple[str, ...]
    start: date
    end: date
    period: str = "ALL"
    include_all: bool = False


def hotspots_root() -> str:
    root = os.environ.get("ASTRO_HOTSPOTS_ROOT")
    if root:
        return root.rstrip("/")
    data_root = (os.environ.get("ASTRO_DATA_ROOT") or "data").rstrip("/")
    return f"{data_root}/processed/hotspots/v1"


def max_rows() -> int:
    return int(os.environ.get("ASTRO_CSV_MAX_ROWS") or DEFAULT_MAX_ROWS)


def _connect(root: str) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("SET memory_limit = '384MB'")
    con.execute("SET threads = 2")
    con.execute("SET preserve_insertion_order = false")
    if root.startswith("gs://"):
        try:
            import gcsfs
        except ImportError as error:  # pragma: no cover - gcsfs is a dependency of the app
            raise HotspotsUnavailable("gs:// needs gcsfs") from error
        # Application Default Credentials: the Cloud Run service account, or a local
        # `gcloud auth application-default login`. No HMAC keys or key files.
        con.register_filesystem(gcsfs.GCSFileSystem())
    elif not Path(root).is_dir():
        raise HotspotsUnavailable(f"hotspots/v1 not found at {root}")
    return con


def _where(query: HotspotQuery) -> tuple[str, list]:
    clauses = [
        "year BETWEEN ? AND ?",  # partition pruning: only the files of these local solar years are read
        "date_local BETWEEN ? AND ?",
        "list_contains(?, cell_l2)",
    ]
    params: list = [query.start.year, query.end.year, query.start, query.end, list(query.cells)]
    if query.period != "ALL":
        clauses.append("daynight = ?")
        params.append(query.period)
    if not query.include_all:
        clauses.append("passes_main_filter")
    return " AND ".join(clauses), params


def _source(root: str) -> str:
    glob = f"{root}/**/*.parquet".replace("'", "''")
    return f"read_parquet('{glob}', hive_partitioning = true)"


def _check_years(root: str, query: HotspotQuery) -> None:
    """A local copy (the offline fallback, D12) often holds a few years only; a year without its partition
    would count as 0 detections. The bucket holds every year and is not listed here."""
    if root.startswith("gs://"):
        return
    years = range(query.start.year, query.end.year + 1)
    present = sorted({p.name.removeprefix("year=") for p in Path(root).glob("*/year=*") if p.is_dir()})
    if not any(str(year) in present for year in years):
        asked = str(years[0]) if len(years) == 1 else f"{years[0]}-{years[-1]}"
        raise YearsNotAvailable(
            f"The native hotspots of {asked} are not on this server (it has: {', '.join(present) or 'none'})."
        )


def count(query: HotspotQuery, root: str | None = None) -> int:
    root = root or hotspots_root()
    con = _connect(root)
    where, params = _where(query)
    try:
        _check_years(root, query)
        row = con.execute(f"SELECT count(*) FROM {_source(root)} WHERE {where}", params).fetchone()
    except duckdb.Error as error:
        raise HotspotsUnavailable(f"hotspots/v1 could not be read: {error}") from error
    finally:
        con.close()
    return int(row[0]) if row else 0


def export_csv(query: HotspotQuery, root: str | None = None, limit: int | None = None) -> Iterator[bytes]:
    """Check the row count, then stream the CSV in blocks (Cloud Run caps unstreamed responses at 32 MiB).

    Raises Busy, TooManyRows or HotspotsUnavailable before the first byte, so the caller can answer with an
    HTTP error instead of a broken file.
    """
    root = root or hotspots_root()
    limit = limit if limit is not None else max_rows()
    if not _EXPORTS.acquire(blocking=False):
        raise Busy("Another CSV export is running. Try again in a moment.")
    try:
        rows = count(query, root)
        if rows > limit:
            raise TooManyRows(rows, limit)
        con = _connect(root)
        where, params = _where(query)
        sql = (
            f"SELECT {', '.join(COLUMNS)} FROM {_source(root)} WHERE {where} "
            "ORDER BY acq_ts_utc, hotspot_id"
        )
        try:
            cursor = con.execute(sql, params)
        except duckdb.Error as error:
            con.close()
            raise HotspotsUnavailable(f"hotspots/v1 could not be read: {error}") from error
    except BaseException:
        _EXPORTS.release()
        raise
    return _Export(cursor, con)


class _Export(Iterator[bytes]):
    """The CSV in blocks. It holds the export slot and the connection, and gives them back when the rows end,
    when it is closed, or when it is dropped without ever being read (the client left before the first byte:
    a plain generator would never run its `finally` then, and every later export would answer 429)."""

    def __init__(self, cursor: duckdb.DuckDBPyConnection, con: duckdb.DuckDBPyConnection) -> None:
        self._con = con
        self._blocks = _blocks(cursor)
        self._closed = False

    def __iter__(self) -> _Export:
        return self

    def __next__(self) -> bytes:
        try:
            return next(self._blocks)
        except BaseException:  # the end of the rows (StopIteration) or a read error: free the slot either way
            self.close()
            raise

    def close(self) -> None:
        if not self._closed:
            self._closed = True
            self._con.close()
            _EXPORTS.release()

    def __del__(self) -> None:
        self.close()


def _blocks(cursor: duckdb.DuckDBPyConnection) -> Iterator[bytes]:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(COLUMNS)
    while True:
        block = cursor.fetchmany(FETCH_ROWS)
        if not block:
            break
        writer.writerows([[_cell(v) for v in row] for row in block])
        yield buffer.getvalue().encode("utf-8")
        buffer.seek(0)
        buffer.truncate()
    tail = buffer.getvalue()
    if tail:
        yield tail.encode("utf-8")


def _cell(value: object) -> object:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if hasattr(value, "isoformat"):
        return value.isoformat()  # type: ignore[union-attr]
    return value
