/**
 * Pure helpers for the map view: when the L2 grid of the area is drawn, and how the globe opens. Kept out of
 * CellMap.tsx (no MapLibre import) so they are unit-tested.
 */
import { L2_SIZE, type Bounds } from "../../lib/grid";

/** MapLibre tiles are 512 px: the world is 512 * 2^zoom px wide (Mercator, and the globe near its center). */
const TILE_PX = 512;

/** Width in px of one 0.25° cell at a zoom level. */
export function cellPx(zoom: number): number {
  return (L2_SIZE / 360) * TILE_PX * 2 ** zoom;
}

/** Zoom at which a 0.25° cell is `px` wide. */
export function zoomForCellPx(px: number): number {
  return Math.log2((px * 360) / (L2_SIZE * TILE_PX));
}

/**
 * The outlines of the area's cells fade in between these zooms: invisible while a cell is under 16 px (zoom ~5.5,
 * where 4,000 outlines are a white mesh over the colors), fully drawn from 32 px (zoom ~6.5), where each cell reads.
 */
export const GRID_FADE = { from: zoomForCellPx(16), to: zoomForCellPx(32), opacity: 0.6 } as const;

/** Opacity of the cell outlines at a zoom (the same ramp as the MapLibre expression below). */
export function gridOutlineOpacity(zoom: number): number {
  const t = (zoom - GRID_FADE.from) / (GRID_FADE.to - GRID_FADE.from);
  return Math.min(1, Math.max(0, t)) * GRID_FADE.opacity;
}

/** MapLibre `line-opacity` for the cell outlines: a linear ramp by zoom. */
export function gridOutlineOpacityExpression(): ["interpolate", ["linear"], ["zoom"], number, number, number, number] {
  return ["interpolate", ["linear"], ["zoom"], GRID_FADE.from, 0, GRID_FADE.to, GRID_FADE.opacity];
}

/**
 * Zoom that shows the whole globe in a map of this size: the globe's diameter (world width / pi) fills 90% of the
 * shorter side. Clamped to 1..3: on a phone the whole globe at zoom 1 is still about 330 px wide, and below that the
 * study area shrinks to a few pixels.
 */
export function globeZoomToFit(width: number, height: number): number {
  const side = Math.max(1, Math.min(width, height));
  const zoom = Math.log2((0.9 * side * Math.PI) / TILE_PX);
  return Math.min(3, Math.max(1, zoom));
}

/** Below this zoom on the globe a cell is under 3 px: a click on the study area flies into it instead of drilling. */
export const GLOBE_FLY_IN_BELOW_ZOOM = 3;

export function boundsCenter(b: Bounds): [number, number] {
  return [(b.west + b.east) / 2, (b.south + b.north) / 2];
}

export function insideBounds(lng: number, lat: number, b: Bounds): boolean {
  return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
}
