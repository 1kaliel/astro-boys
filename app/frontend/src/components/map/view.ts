/**
 * Pure helpers for the map view: when the L2 grid of the area is drawn, how opaque the cells are at each zoom, which
 * cell has the focus when zoomed in, where the data layers go among the basemap labels, and how the globe opens.
 * Kept out of CellMap.tsx (no MapLibre import) so they are unit-tested.
 */
import { L2_SIZE, cellIdAt, l3IdAt, type Bounds } from "../../lib/grid";

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

/** An L3 cell is 4 x smaller than an L2 cell: it reaches the same width on screen 2 zoom levels later. */
export const L3_ZOOM_OFFSET = 2;

/**
 * Cell fill opacity by zoom, so the map reads like a normal map once you zoom in: strong while a cell is at most
 * 16 px (the overview, where the colors are the message; the same 16 px as GRID_FADE), translucent from 256 px (a
 * cell covers a large part of the map), where roads, rivers and terrain inside it show through. Linear in zoom
 * between the two. The color, and so the class of the legend, does not change; only how much basemap shows.
 */
export const FILL_FADE = { from: zoomForCellPx(16), to: zoomForCellPx(256), strong: 0.85, light: 0.45 } as const;

/**
 * Focus on the cell you zoom into: from 64 px per cell (zoom ~7.5 for L2 cells, ~9.5 for L3 sub-cells) the cell at
 * the map center (or under a mouse pointer) gets an outline and an info chip, and the other cells are dimmed a little.
 */
export const FOCUS = { cellPx: 64, dim: 0.8 } as const;

/** Zoom at which the focus starts, for L2 cells (offset 0) or L3 sub-cells (offset L3_ZOOM_OFFSET). */
export function focusZoom(levelOffset = 0): number {
  return zoomForCellPx(FOCUS.cellPx) + levelOffset;
}

/** True once a cell of the level is large enough on screen to be focused. */
export function focusActive(zoom: number, levelOffset = 0): boolean {
  return zoom >= focusZoom(levelOffset);
}

/** Fill opacity of a cell at a zoom (the same ramp as the MapLibre expression below), dimmed when another cell has the focus. */
export function cellFillOpacity(zoom: number, levelOffset = 0, dimmed = false): number {
  const from = FILL_FADE.from + levelOffset;
  const to = FILL_FADE.to + levelOffset;
  const t = Math.min(1, Math.max(0, (zoom - from) / (to - from)));
  const opacity = FILL_FADE.strong + (FILL_FADE.light - FILL_FADE.strong) * t;
  return dimmed ? opacity * FOCUS.dim : opacity;
}

type ZoomExpression = ["interpolate", ["linear"], ["zoom"], ...unknown[]];

/**
 * MapLibre `fill-opacity` for the cells. With a focused cell (`focusId`, matched on the feature's `id`), the other
 * cells are dimmed from the zoom where the focus starts; below it, and without a focus, every cell has the same ramp.
 */
export function cellFillOpacityExpression(levelOffset = 0, focusId: string | null = null): ZoomExpression {
  const from = FILL_FADE.from + levelOffset;
  const to = FILL_FADE.to + levelOffset;
  if (!focusId) return ["interpolate", ["linear"], ["zoom"], from, FILL_FADE.strong, to, FILL_FADE.light];
  const at = focusZoom(levelOffset);
  const pick = (zoom: number) => [
    "case",
    ["==", ["get", "id"], focusId],
    cellFillOpacity(zoom, levelOffset),
    cellFillOpacity(zoom, levelOffset, true),
  ];
  return ["interpolate", ["linear"], ["zoom"], from, FILL_FADE.strong, at, pick(at), to, pick(to)];
}

/**
 * The cell that would take the focus at a point (the map center, or the pointer): the L2 cell inside the study area,
 * or, in the drill-down of `drillCell`, its L3 sub-cell (null outside the drilled cell). Whether the zoom is enough
 * is `focusActive`; whether there is a value is up to the caller (a cell with no detection is outlined, never filled).
 */
export function focusCellAt(lng: number, lat: number, study: Bounds, drillCell: string | null): string | null {
  if (drillCell) {
    const id = l3IdAt(lat, lng);
    return id.startsWith(`${drillCell}.`) ? id : null;
  }
  return insideBounds(lng, lat, study) ? cellIdAt(lat, lng) : null;
}

/** True when the id is a focus candidate of the current view: an L2 id on the L2 map, an L3 id of the drilled cell in the drill-down. */
export function isFocusOf(id: string | null, drillCell: string | null): id is string {
  if (!id) return false;
  const parts = id.split(".").length;
  return drillCell ? parts === 3 && id.startsWith(`${drillCell}.`) : parts === 2;
}

type StyleLayers<L> = { layers: L[] };

/**
 * Where the data layers go in the basemap: the index of the first layer of the basemap's trailing block of symbol
 * (label) layers, so place names stay above the cells at every zoom while roads, rivers and borders stay below
 * them, in both OpenFreeMap styles (the dark style has a water-name symbol layer early on, under its roads). The
 * length of the list when the style ends with no symbol layer (the offline background-only style): on top.
 */
export function labelBlockIndex(layers: readonly { type: string }[]): number {
  let i = layers.length;
  while (i > 0 && layers[i - 1].type === "symbol") i--;
  return i;
}

/** Id of the hidden layer the data layers are inserted before (their `beforeId`). */
export const DATA_ANCHOR = "astro-data-anchor";

/**
 * The basemap style with a hidden, empty anchor layer where the data layers go (see `labelBlockIndex`). Every style
 * has the same anchor id, so a theme switch never moves a layer before a label id of the other style.
 */
export function withDataAnchor<L extends { id: string; type: string }, S extends StyleLayers<L>>(style: S): S {
  const layers = style.layers.filter((layer) => layer.id !== DATA_ANCHOR);
  const anchor = { id: DATA_ANCHOR, type: "background", layout: { visibility: "none" } } as unknown as L;
  const at = labelBlockIndex(layers);
  return { ...style, layers: [...layers.slice(0, at), anchor, ...layers.slice(at)] };
}
