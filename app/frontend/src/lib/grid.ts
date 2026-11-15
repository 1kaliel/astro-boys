/**
 * Hierarchical AGGS-style grid (docs/spec/harmonization.md section 4). L2 cells are 0.25°.
 * IDs: "G" + 3-digit floor(lat + 90) + 3-digit floor(lon + 180) + "." + 2-digit k, where k = row * 4 + col + 1
 * inside the 1° cell, rows from the south and columns from the west. An L3 ID (0.0625°) adds ".NN" with the same
 * rule inside its L2 cell.
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

/** L3 cells are 0.0625° (about 7 km): the drill-down of native detections only, never of estimates. */
export const L3_SIZE = L2_SIZE / 4;

/** Bounds of an L3 cell ("G072131.11.05"), derived from its ID alone: the same k rule, inside the L2 cell. */
export function l3Bounds(id: string): Bounds {
  const match = /^(G\d{6}\.\d{2})\.(\d{2})$/.exec(id);
  if (!match) throw new Error(`Not an L3 cell ID: ${id}`);
  const k = Number(match[2]) - 1;
  if (k < 0 || k > 15) throw new Error(`L3 index out of range in ${id}`);
  const parent = cellBounds(match[1]);
  const south = parent.south + Math.floor(k / 4) * L3_SIZE;
  const west = parent.west + (k % 4) * L3_SIZE;
  return { west, south, east: west + L3_SIZE, north: south + L3_SIZE };
}

/** ID of the L3 cell that contains the point (lat, lon). */
export function l3IdAt(lat: number, lon: number): string {
  const l2 = cellIdAt(lat, lon);
  const b = cellBounds(l2);
  const row = Math.min(3, Math.floor((lat - b.south) / L3_SIZE));
  const col = Math.min(3, Math.floor((lon - b.west) / L3_SIZE));
  return `${l2}.${pad(row * 4 + col + 1, 2)}`;
}

/** The 16 L3 cells of an L2 cell, in k order (rows from the south, columns from the west). */
export function l3Children(l2Id: string): string[] {
  cellBounds(l2Id); // throws on a bad ID
  return Array.from({ length: 16 }, (_, i) => `${l2Id}.${pad(i + 1, 2)}`);
}

/**
 * The 3 x 3 block of L2 cells around one cell, the cell itself in the middle (index 4), from the south-west corner,
 * row by row. Crosses 1° boundaries (the neighbor gets another L1 prefix). Rows past a pole are left out, and
 * longitudes wrap at the antimeridian.
 */
export function neighborsOf(l2Id: string): string[] {
  const b = cellBounds(l2Id);
  const lat = b.south + L2_SIZE / 2;
  const lon = b.west + L2_SIZE / 2;
  const ids: string[] = [];
  for (const dLat of [-1, 0, 1]) {
    const y = lat + dLat * L2_SIZE;
    if (y < -90 || y > 90) continue;
    for (const dLon of [-1, 0, 1]) {
      const x = lon + dLon * L2_SIZE;
      ids.push(cellIdAt(y, x >= 180 ? x - 360 : x < -180 ? x + 360 : x));
    }
  }
  return ids;
}

/** The smallest bounds that enclose the boxes (e.g. the 3 x 3 block of the drill-down). */
export function unionBounds(boxes: readonly Bounds[]): Bounds {
  return {
    west: Math.min(...boxes.map((b) => b.west)),
    south: Math.min(...boxes.map((b) => b.south)),
    east: Math.max(...boxes.map((b) => b.east)),
    north: Math.max(...boxes.map((b) => b.north)),
  };
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

export type CellFeatureProps = { id: string; value: number; estimated: boolean; partial: boolean };

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
