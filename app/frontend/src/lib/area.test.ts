import { describe, expect, it } from "vitest";
import { PILOT_BOUNDS } from "../state/dashboard";
import { boundsSizeKm, formatDegrees, formatSizeKm, previewBounds } from "./area";
import { cellsInBounds } from "./grid";

describe("bounds preview (the Area panel)", () => {
  it("accepts the study area as it is, with its cell count and size", () => {
    const p = previewBounds(PILOT_BOUNDS, PILOT_BOUNDS);
    expect(p.errors).toEqual([]);
    expect(p.clamped).toBe(false);
    expect(p.area).toEqual(PILOT_BOUNDS);
    expect(p.cells).toBe(cellsInBounds(PILOT_BOUNDS).length);
    expect(p.cells).toBe(4060);
    // 14.1° of longitude at about 9.7° S, 17.4° of latitude.
    expect(p.widthKm).toBeGreaterThan(1530);
    expect(p.widthKm).toBeLessThan(1560);
    expect(p.heightKm).toBeGreaterThan(1910);
    expect(p.heightKm).toBeLessThan(1930);
  });

  it("asks for west < east and south < north", () => {
    const p = previewBounds({ west: -40, south: -5, east: -42, north: -8 }, PILOT_BOUNDS);
    expect(p.errors).toEqual(["West must be less than East.", "South must be less than North."]);
    expect(p.cells).toBe(0);
  });

  it("rejects a box outside the study area", () => {
    const p = previewBounds({ west: -60, south: -30, east: -55, north: -25 }, PILOT_BOUNDS);
    expect(p.errors).toEqual(["The box is outside the study area: it must overlap it."]);
  });

  it("clamps edges outside the study area and says so", () => {
    const p = previewBounds({ west: -50, south: -10, east: -40, north: 2 }, PILOT_BOUNDS);
    expect(p.errors).toEqual([]);
    expect(p.clamped).toBe(true);
    expect(p.area).toEqual({ west: -48.8, south: -10, east: -40, north: -1 });
    expect(p.cells).toBe(cellsInBounds(p.area).length);
  });

  it("does not report clamping for a box inside the study area", () => {
    const p = previewBounds({ west: -42, south: -8, east: -40, north: -6 }, PILOT_BOUNDS);
    expect(p.clamped).toBe(false);
    expect(p.cells).toBe(64); // 8 x 8 cells of 0.25°
  });

  it("flags an empty field", () => {
    expect(previewBounds({ west: Number.NaN, south: -8, east: -40, north: -6 }, PILOT_BOUNDS).errors).toEqual([
      "Fill in all four edges.",
    ]);
  });
});

describe("size and number formats", () => {
  it("measures a 1° box at the equator as about 111 km on each side", () => {
    const s = boundsSizeKm({ west: 0, south: -0.5, east: 1, north: 0.5 });
    expect(s.widthKm).toBeCloseTo(111.3, 0);
    expect(s.heightKm).toBeCloseTo(110.6, 0);
  });

  it("shrinks east-west with latitude", () => {
    expect(boundsSizeKm({ west: 0, south: 59.5, east: 1, north: 60.5 }).widthKm).toBeCloseTo(55.7, 0);
  });

  it("formats degrees and km", () => {
    expect(formatDegrees(-48.8)).toBe("-48.8");
    expect(formatDegrees(-1)).toBe("-1");
    expect(formatSizeKm(1546.4, 1923.9)).toBe("about 1,550 × 1,920 km");
  });
});
