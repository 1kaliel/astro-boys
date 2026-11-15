import { describe, expect, it } from "vitest";
import { PILOT_BOUNDS } from "../../state/dashboard";
import {
  GRID_FADE,
  boundsCenter,
  cellPx,
  globeZoomToFit,
  gridOutlineOpacity,
  gridOutlineOpacityExpression,
  insideBounds,
  zoomForCellPx,
} from "./view";

describe("grid outline fade", () => {
  it("relates zoom and cell width", () => {
    expect(cellPx(zoomForCellPx(20))).toBeCloseTo(20, 6);
    // At zoom 6 a 0.25° cell is about 23 px wide.
    expect(cellPx(6)).toBeCloseTo(22.76, 1);
  });

  it("hides the outlines at the zoom that frames the whole study area, and shows them when cells are large", () => {
    // The pilot box framed in a 400 to 900 px map is about zoom 4 to 5.5.
    expect(gridOutlineOpacity(4.5)).toBe(0);
    expect(gridOutlineOpacity(GRID_FADE.from)).toBe(0);
    expect(gridOutlineOpacity(GRID_FADE.to)).toBeCloseTo(GRID_FADE.opacity, 6);
    expect(gridOutlineOpacity(10)).toBeCloseTo(GRID_FADE.opacity, 6);
    const mid = gridOutlineOpacity((GRID_FADE.from + GRID_FADE.to) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(GRID_FADE.opacity);
  });

  it("starts at 16 px cells and ends at 32 px cells", () => {
    expect(cellPx(GRID_FADE.from)).toBeCloseTo(16, 6);
    expect(cellPx(GRID_FADE.to)).toBeCloseTo(32, 6);
  });

  it("builds the MapLibre expression from the same stops", () => {
    expect(gridOutlineOpacityExpression()).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      GRID_FADE.from,
      0,
      GRID_FADE.to,
      GRID_FADE.opacity,
    ]);
  });
});

describe("globe view", () => {
  it("fits the whole globe in the shorter side", () => {
    const zoom = globeZoomToFit(1280, 600);
    const diameter = (512 * 2 ** zoom) / Math.PI;
    expect(diameter).toBeCloseTo(0.9 * 600, 6);
  });

  it("stays within 1 to 3", () => {
    expect(globeZoomToFit(100, 100)).toBe(1);
    expect(globeZoomToFit(10000, 10000)).toBe(3);
    expect(globeZoomToFit(0, 0)).toBe(1);
  });

  it("knows the study area's center and what is inside it", () => {
    expect(boundsCenter(PILOT_BOUNDS)).toEqual([-41.75, -9.7]);
    expect(insideBounds(-40, -8, PILOT_BOUNDS)).toBe(true);
    expect(insideBounds(-60, -8, PILOT_BOUNDS)).toBe(false);
  });
});
