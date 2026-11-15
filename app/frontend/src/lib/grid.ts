/**
 * Hierarchical AGGS-style grid (docs/spec/harmonization.md section 4). L2 cells are 0.25°.
 * IDs: "G" + 3-digit floor(lat + 90) + 3-digit floor(lon + 180) + "." + 2-digit k, where k = row * 4 + col + 1
 * inside the 1° cell, rows from the south and columns from the west.
 */
export const L2_SIZE = 0.25;

export type Bounds = { west: number; south: number; east: number; north: number };

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** ID of the L2 cell that contains the point (lat, lon). */
export function cellIdAt(lat: number, lon: number): string {
  const l1Lat = Math.floor(lat + 90);
  const l1Lon = Math.floor(lon + 180);
  const row = Math.floor((lat + 90 - l1Lat) * 4);
  const col = Math.floor((lon + 180 - l1Lon) * 4);
  return `G${pad(l1Lat, 3)}${pad(l1Lon, 3)}.${pad(row * 4 + col + 1, 2)}`;
}

/** Bounds of an L2 cell, derived from its ID alone. */
export function cellBounds(id: string): Bounds {
  const match = /^G(\d{3})(\d{3})\.(\d{2})$/.exec(id);
  if (!match) throw new Error(`Not an L2 cell ID: ${id}`);
  const k = Number(match[3]) - 1;
  if (k < 0 || k > 15) throw new Error(`L2 index out of range in ${id}`);
  const south = Number(match[1]) - 90 + Math.floor(k / 4) * L2_SIZE;
  const west = Number(match[2]) - 180 + (k % 4) * L2_SIZE;
  return { west, south, east: west + L2_SIZE, north: south + L2_SIZE };
}

/**
 * L2 cells that overlap the bounds; cells that only touch an edge are out. Same rule as the API
 * (/api/calendar, app/backend/astro_dashboard/calendar.py), so the map and the calendar talk about the same cells.
 */
export function cellsInBounds(bounds: Bounds): string[] {
  const ids: string[] = [];
  for (let iLat = Math.floor(bounds.south / L2_SIZE); iLat * L2_SIZE < bounds.north; iLat++) {
    if ((iLat + 1) * L2_SIZE <= bounds.south) continue;
    for (let iLon = Math.floor(bounds.west / L2_SIZE); iLon * L2_SIZE < bounds.east; iLon++) {
      if ((iLon + 1) * L2_SIZE <= bounds.west) continue;
      ids.push(cellIdAt((iLat + 0.5) * L2_SIZE, (iLon + 0.5) * L2_SIZE));
    }
  }
  return ids;
}

export type CellFeatureProps = {
  id: string;
  value: number;
  estimated: boolean;
  partial: boolean;
  /** 90% interval of an estimated harmonized cell. */
  ci_low?: number;
  ci_high?: number;
  /** Native series: the one satellite the count belongs to. */
  satellite?: string;
};

/** Polygons for the map, built in the browser so the API only sends values. */
export function cellsToGeoJSON(cells: readonly CellFeatureProps[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: "FeatureCollection",
    features: cells.map((cell) => {
      const b = cellBounds(cell.id);
      return {
        type: "Feature",
        properties: cell,
        geometry: {
          type: "Polygon",
          coordinates: [[[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]],
        },
      };
    }),
  };
}

/** Outlines of the given L2 cells, for the map: the cells an area is made of (the same list the API sums). */
export function cellOutlinesGeoJSON(ids: readonly string[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return { type: "FeatureCollection", features: ids.map((id) => boundsToGeoJSON(cellBounds(id))) };
}

export function boundsToGeoJSON(b: Bounds): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]],
    },
  };
}

/** Clamp bounds to a frame (e.g. the pilot extent) and round to 2 decimals for display. */
export function clampBounds(b: Bounds, frame: Bounds): Bounds {
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    west: r(Math.max(b.west, frame.west)),
    south: r(Math.max(b.south, frame.south)),
    east: r(Math.min(b.east, frame.east)),
    north: r(Math.min(b.north, frame.north)),
  };
}
