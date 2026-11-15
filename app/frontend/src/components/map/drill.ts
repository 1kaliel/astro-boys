import { useCallback, useEffect, useState } from "react";
import { ApiError, drilldownUrl, fetchDrilldown, type DrilldownRequest, type DrilldownResponse } from "../../data/api";
import { formatCount } from "../../lib/format";
import { cellBounds, l3Bounds, l3Children, neighborsOf, unionBounds, type Bounds } from "../../lib/grid";

/**
 * L3 drill-down of the map (task D11): one L2 cell split 4 x 4 into 0.0625° cells of NATIVE detections of the month's
 * source satellite, with its 8 neighbors for context. Harmonized estimates exist only at 0.25°; nothing here is one.
 */

export type DrillLoad =
  | { status: "loading" }
  | { status: "ready"; data: DrilldownResponse }
  /** `code`: the HTTP status, 0 for a network error. 503 = detections unreadable; 422 = e.g. a month with no data. */
  | { status: "error"; message: string; code: number };

/** Fetches the drill-down of a cell; aborts a stale request when the cell or the month changes. No retry loop:
 * the user gets a Retry button. */
export function useDrilldown(request: DrilldownRequest | null): { load: DrillLoad | null; retry: () => void } {
  const [load, setLoad] = useState<DrillLoad | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const url = request ? drilldownUrl(request) : null;

  useEffect(() => {
    if (!request) {
      setLoad(null);
      return;
    }
    const controller = new AbortController();
    setLoad({ status: "loading" });
    fetchDrilldown(request, controller.signal)
      .then((data) => setLoad({ status: "ready", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const code = error instanceof ApiError ? error.status : 0;
        const message = error instanceof Error ? error.message : String(error);
        setLoad({ status: "error", message, code });
      });
    return () => controller.abort();
    // `url` holds every field of the request, so the request object itself is not a dependency.
  }, [url, attempt]);

  return { load, retry };
}

const SATELLITES: Record<string, string> = {
  aqua: "Aqua",
  terra: "Terra",
  snpp: "S-NPP",
  "s-npp": "S-NPP",
  npp: "S-NPP",
  "suomi npp": "S-NPP",
  "suomi-npp": "S-NPP",
  n20: "NOAA-20",
  noaa20: "NOAA-20",
  "noaa-20": "NOAA-20",
  n21: "NOAA-21",
  noaa21: "NOAA-21",
  "noaa-21": "NOAA-21",
};

/** Display name of a satellite code from the API ("SNPP" -> "S-NPP"); unknown codes pass through. */
export function satelliteName(code: string): string {
  return SATELLITES[code.trim().toLowerCase()] ?? code;
}

/** "1 native detection", "1,204 native detections". */
export function nativeDetections(count: number): string {
  return `${formatCount(count)} native detection${count === 1 ? "" : "s"}`;
}

export type DrillCellProps = { id: string; count: number | null; target: boolean };
export type DrillL3Props = { id: string; count: number };

function polygon<P>(b: Bounds, properties: P): GeoJSON.Feature<GeoJSON.Polygon, P> {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [[[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]],
    },
  };
}

/**
 * The 3 x 3 block of L2 cells, with their native counts once the answer is in (null while loading). The block comes
 * from the grid, so the map can frame it before the API answers.
 */
export function blockGeoJSON(cell: string, data: DrilldownResponse | null): GeoJSON.FeatureCollection<GeoJSON.Polygon, DrillCellProps> {
  const counts = new Map((data?.cell === cell ? data.neighbors : []).map((n) => [n.id, n.count]));
  return {
    type: "FeatureCollection",
    features: neighborsOf(cell).map((id) =>
      // A neighbor missing from a loaded answer had no detection: the API lists the block, so this is a valid zero.
      polygon(cellBounds(id), { id, count: data?.cell === cell ? (counts.get(id) ?? 0) : null, target: id === cell }),
    ),
  };
}

/** The 16 L3 cells of the target, zero where the API lists none; nothing when the cell was not subdivided. */
export function l3GeoJSON(data: DrilldownResponse | null): GeoJSON.FeatureCollection<GeoJSON.Polygon, DrillL3Props> {
  if (!data || !data.subdivided) return { type: "FeatureCollection", features: [] };
  const counts = new Map(data.l3.map((c) => [c.id, c.count]));
  return {
    type: "FeatureCollection",
    features: l3Children(data.cell).map((id) => polygon(l3Bounds(id), { id, count: counts.get(id) ?? 0 })),
  };
}

/** Bounds of the 3 x 3 block, to frame the map. */
export function blockBounds(cell: string): Bounds {
  return unionBounds(neighborsOf(cell).map(cellBounds));
}
