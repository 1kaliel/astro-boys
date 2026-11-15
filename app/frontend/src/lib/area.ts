import { cellsInBounds, clampBounds, type Bounds } from "./grid";

export type AreaCheck = { ok: true; area: Bounds; cells: number } | { ok: false; message: string };

/**
 * One rule for every way of choosing an area (filter fields, rectangle, visible map area):
 * clamp to the frame (the pilot extent), and require at least one 0.25° cell to overlap it.
 */
export function checkArea(candidate: Bounds, frame: Bounds): AreaCheck {
  const area = clampBounds(candidate, frame);
  if (!(area.west < area.east && area.south < area.north)) {
    return { ok: false, message: "The area must overlap the study area (Northeast Brazil), the only place with data." };
  }
  const cells = cellsInBounds(area).length;
  if (cells === 0) {
    return { ok: false, message: "The area must overlap at least one 0.25° cell." };
  }
  return { ok: true, area, cells };
}

export function sameBounds(a: Bounds, b: Bounds): boolean {
  return a.west === b.west && a.south === b.south && a.east === b.east && a.north === b.north;
}

/** Kilometres per degree of latitude, and of longitude at the equator (WGS84, rounded): enough for "about". */
const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LON = 111.32;

/** Approximate size of a box in km: east-west at its middle latitude, and north-south. */
export function boundsSizeKm(b: Bounds): { widthKm: number; heightKm: number } {
  const midLat = ((b.south + b.north) / 2) * (Math.PI / 180);
  return {
    widthKm: Math.max(0, b.east - b.west) * KM_PER_DEG_LON * Math.cos(midLat),
    heightKm: Math.max(0, b.north - b.south) * KM_PER_DEG_LAT,
  };
}

/** What the typed bounds would select, before they are applied: problems, clamping and the resulting cells. */
export type BoundsPreview = {
  /** Problems that block "Apply", in words. Empty when the bounds can be applied. */
  errors: string[];
  /** The bounds after clamping to the frame; what "Apply" sends. */
  area: Bounds;
  /** True when some edge was moved to the frame (the study area). */
  clamped: boolean;
  /** L2 cells that overlap the clamped bounds (the same rule as the API). */
  cells: number;
  widthKm: number;
  heightKm: number;
};

/**
 * Checks typed bounds against the study area: west < east, south < north, and some overlap with the frame. Edges
 * outside the frame are clamped with `clampBounds` and reported, never dropped silently.
 */
export function previewBounds(candidate: Bounds, frame: Bounds): BoundsPreview {
  const errors: string[] = [];
  const values = [candidate.west, candidate.south, candidate.east, candidate.north];
  if (values.some((v) => !Number.isFinite(v))) {
    errors.push("Fill in all four edges.");
  } else {
    if (!(candidate.west < candidate.east)) errors.push("West must be less than East.");
    if (!(candidate.south < candidate.north)) errors.push("South must be less than North.");
  }
  const area = clampBounds(candidate, frame);
  const clamped = !errors.length && !sameBounds(area, roundBounds(candidate));
  if (!errors.length && !(area.west < area.east && area.south < area.north)) {
    errors.push("The box is outside the study area: it must overlap it.");
  }
  const cells = errors.length ? 0 : cellsInBounds(area).length;
  if (!errors.length && cells === 0) errors.push("The box must overlap at least one 0.25° cell.");
  const size = errors.length ? { widthKm: 0, heightKm: 0 } : boundsSizeKm(area);
  return { errors, area, clamped, cells, ...size };
}

function roundBounds(b: Bounds): Bounds {
  const r = (v: number) => Math.round(v * 100) / 100;
  return { west: r(b.west), south: r(b.south), east: r(b.east), north: r(b.north) };
}

/** "-48.8" for a coordinate, at most two decimals, en-US (decimal point). */
export function formatDegrees(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2, useGrouping: false });
}

/** "about 1,540 × 1,930 km" (east-west × north-south), rounded to 10 km. */
export function formatSizeKm(widthKm: number, heightKm: number): string {
  const r = (km: number) => (Math.round(km / 10) * 10).toLocaleString("en-US");
  return `about ${r(widthKm)} × ${r(heightKm)} km`;
}
