import type { CellValue } from "../data/api";
import { L2_SIZE, cellBounds, type Bounds } from "./grid";
import { classOf, rampStep } from "./scale";

export type LatLng = { lat: number; lng: number };

/**
 * The rectangle between two clicked corners, widened outward to whole 0.25° cells. Snapping keeps the selection on
 * the grid the harmonized data lives on, so no cell is half in and half out. Clamped to the valid coordinates.
 */
export function cornersToBounds(a: LatLng, b: LatLng, size: number = L2_SIZE): Bounds {
  const lo = (x: number) => Math.floor(x / size) * size;
  const hi = (x: number) => Math.ceil(x / size) * size;
  return {
    south: Math.max(-90, lo(Math.min(a.lat, b.lat))),
    north: Math.min(90, hi(Math.max(a.lat, b.lat))),
    west: Math.max(-180, lo(Math.min(a.lng, b.lng))),
    east: Math.min(180, hi(Math.max(a.lng, b.lng))),
  };
}

/** True when the two corners are the same cell (a single click turned into a rectangle of one cell). */
export function isSingleCell(b: Bounds, size: number = L2_SIZE): boolean {
  return Math.abs(b.east - b.west - size) < 1e-9 && Math.abs(b.north - b.south - size) < 1e-9;
}

export type GlobeTile = {
  id: string;
  /** South-west corner: the tiles layer anchors a tile there. */
  lat: number;
  lng: number;
  value: number;
  /** Step of the sequential ramp, 1 (least) to 7 (most). */
  step: number;
  estimated: boolean;
  partial: boolean;
};

/**
 * One tile per cell with at least one detection. A cell with none is not drawn: "no detection" never means
 * "no fire", and an empty area stays empty (same rule as the flat map).
 */
export function cellsToTiles(cells: readonly CellValue[], breaks: readonly number[]): GlobeTile[] {
  const classes = breaks.length + 1;
  return cells
    .filter((cell) => cell.value > 0)
    .map((cell) => {
      const b = cellBounds(cell.id);
      const step = rampStep(classOf(cell.value, breaks), classes) || 1;
      return { id: cell.id, lat: b.south, lng: b.west, value: cell.value, step, estimated: cell.estimated, partial: cell.partial };
    });
}

/** Relief: a stronger class stands a little higher above the globe (a fraction of the globe radius). */
export function tileAltitude(step: number): number {
  return 0.003 + step * 0.0045;
}

/** The selected area as a GeoJSON polygon, for the outline on the globe. */
export function boundsToPolygon(b: Bounds): { type: "Polygon"; coordinates: number[][][] } {
  return {
    type: "Polygon",
    coordinates: [
      [
        [b.west, b.south],
        [b.east, b.south],
        [b.east, b.north],
        [b.west, b.north],
        [b.west, b.south],
      ],
    ],
  };
}

/** "9.5°S to 8.5°S, 40.5°W to 39.0°W", for the status line under the globe. */
export function describeBounds(b: Bounds): string {
  const lat = (v: number) => `${Math.abs(v).toFixed(2).replace(/\.?0+$/, "")}°${v < 0 ? "S" : "N"}`;
  const lng = (v: number) => `${Math.abs(v).toFixed(2).replace(/\.?0+$/, "")}°${v < 0 ? "W" : "E"}`;
  return `${lat(b.south)} to ${lat(b.north)}, ${lng(b.west)} to ${lng(b.east)}`;
}

/** NASA GIBS Blue Marble tile (Web Mercator, levels 0 to 8): the imagery draped on the globe. */
export const GIBS_MAX_LEVEL = 8;
export function gibsTileUrl(x: number, y: number, level: number): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${level}/${y}/${x}.jpeg`;
}
