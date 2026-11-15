import { cellsInBounds, clampBounds, type Bounds } from "./grid";

export type AreaCheck = { ok: true; area: Bounds; cells: number } | { ok: false; message: string };

/**
 * One rule for every way of choosing an area (filter fields, rectangle, visible map area):
 * clamp to the frame (the pilot extent), and require at least one 0.25° cell to overlap it.
 */
export function checkArea(candidate: Bounds, frame: Bounds): AreaCheck {
  const area = clampBounds(candidate, frame);
  if (!(area.west < area.east && area.south < area.north)) {
    return { ok: false, message: "The area must overlap the pilot extent (Northeast Brazil)." };
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
