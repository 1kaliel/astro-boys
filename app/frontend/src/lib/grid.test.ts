import { describe, expect, it } from "vitest";
import {
  cellBounds,
  cellIdAt,
  cellOutlinesGeoJSON,
  cellsInBounds,
  cellsToGeoJSON,
  clampBounds,
  l3Bounds,
  l3Children,
  l3IdAt,
  neighborsOf,
  unionBounds,
} from "./grid";

const PILOT = { west: -48.8, south: -18.4, east: -34.7, north: -1.0 };

describe("grid", () => {
  it("decodes an L2 ID to its bounds (checked against the simulated calendar table)", () => {
    expect(cellBounds("G072131.11")).toEqual({ west: -48.5, south: -17.5, east: -48.25, north: -17.25 });
    expect(cellBounds("G072131.12")).toEqual({ west: -48.25, south: -17.5, east: -48.0, north: -17.25 });
  });

  it("encodes a point to the cell that contains it, and round-trips", () => {
    expect(cellIdAt(-17.375, -48.375)).toBe("G072131.11");
    for (const id of ["G071131.01", "G088144.16", "G080140.06"]) {
      const b = cellBounds(id);
      expect(cellIdAt((b.south + b.north) / 2, (b.west + b.east) / 2)).toBe(id);
    }
  });

  it("selects the cells that overlap the bounds: the pilot extent overlaps 70 x 58 = 4060 cells", () => {
    const ids = cellsInBounds(PILOT);
    expect(ids).toHaveLength(4060);
    expect(new Set(ids).size).toBe(4060);
    expect(ids).toContain("G072131.11");
  });

  it("a cell that only touches the bounds is out, and a box inside one cell selects that cell", () => {
    expect(cellsInBounds(cellBounds("G072131.11"))).toEqual(["G072131.11"]);
    const b = cellBounds("G072131.12");
    expect(cellsInBounds({ west: b.west + 0.05, south: b.south + 0.05, east: b.east - 0.05, north: b.north - 0.05 })).toEqual([
      "G072131.12",
    ]);
  });

  it("a box across cell edges selects every cell it overlaps (same rule as /api/calendar)", () => {
    // -48.6..-47.9 overlaps 4 columns and -17.6..-17.2 overlaps 3 rows.
    const ids = cellsInBounds({ west: -48.6, south: -17.6, east: -47.9, north: -17.2 });
    expect(ids).toHaveLength(12);
    expect(ids).toEqual(expect.arrayContaining(["G072131.11", "G072131.12"]));
  });

  it("rejects malformed IDs", () => {
    expect(() => cellBounds("G072131.17")).toThrow();
    expect(() => cellBounds("nope")).toThrow();
  });

  it("builds closed polygons and clamps bounds to a frame", () => {
    const fc = cellsToGeoJSON([{ id: "G072131.11", value: 3, estimated: false, partial: false }]);
    const ring = fc.features[0].geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[4]);
    expect(clampBounds({ west: -60, south: -20, east: -30, north: 2 }, PILOT)).toEqual(PILOT);
  });
});

describe("area cell outlines", () => {
  it("draws one 0.25° square per cell the area counts, so the map and the sum use the same list", () => {
    const area = { west: -41, south: -10, east: -40, north: -9 };
    const ids = cellsInBounds(area);
    const outlines = cellOutlinesGeoJSON(ids);
    expect(outlines.features).toHaveLength(ids.length);
    expect(ids).toHaveLength(16);
    for (const feature of outlines.features) {
      const ring = feature.geometry.coordinates[0];
      const xs = ring.map((p) => p[0]);
      const ys = ring.map((p) => p[1]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.25, 9);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.25, 9);
    }
  });
});

describe("L3 drill-down cells", () => {
  it("decodes an L3 ID from the ID alone: k = row * 4 + col + 1 inside the L2 cell", () => {
    // G072131.11 is -48.5..-48.25 x -17.5..-17.25.
    expect(l3Bounds("G072131.11.01")).toEqual({ west: -48.5, south: -17.5, east: -48.4375, north: -17.4375 });
    expect(l3Bounds("G072131.11.04")).toEqual({ west: -48.3125, south: -17.5, east: -48.25, north: -17.4375 });
    expect(l3Bounds("G072131.11.05")).toEqual({ west: -48.5, south: -17.4375, east: -48.4375, north: -17.375 });
    expect(l3Bounds("G072131.11.16")).toEqual({ west: -48.3125, south: -17.3125, east: -48.25, north: -17.25 });
  });

  it("round-trips a point to its L3 cell and back, and the parent is the ID without its last .NN", () => {
    for (const id of l3Children("G080140.06")) {
      const b = l3Bounds(id);
      expect(l3IdAt((b.south + b.north) / 2, (b.west + b.east) / 2)).toBe(id);
      expect(id.slice(0, -3)).toBe("G080140.06");
      expect(cellIdAt((b.south + b.north) / 2, (b.west + b.east) / 2)).toBe("G080140.06");
    }
  });

  it("the 16 children tile their parent exactly", () => {
    const ids = l3Children("G072131.11");
    expect(ids).toHaveLength(16);
    expect(new Set(ids).size).toBe(16);
    expect(ids[0]).toBe("G072131.11.01");
    expect(ids[15]).toBe("G072131.11.16");
    expect(unionBounds(ids.map(l3Bounds))).toEqual(cellBounds("G072131.11"));
    const area = ids.map(l3Bounds).reduce((sum, b) => sum + (b.east - b.west) * (b.north - b.south), 0);
    expect(area).toBeCloseTo(0.25 * 0.25, 12);
  });

  it("rejects malformed L3 IDs", () => {
    expect(() => l3Bounds("G072131.11")).toThrow();
    expect(() => l3Bounds("G072131.11.00")).toThrow();
    expect(() => l3Bounds("G072131.11.17")).toThrow();
    expect(() => l3Bounds("G072131.17.01")).toThrow();
    expect(() => l3Bounds("G072131.11.1")).toThrow();
    expect(() => l3Children("G072131.11.01")).toThrow();
    expect(() => l3Children("nope")).toThrow();
  });
});

describe("neighbors of an L2 cell", () => {
  it("returns the 3 x 3 block, the cell in the middle, inside one 1° cell", () => {
    // k = 6 is row 1, col 1: every neighbor is in the same 1° cell.
    expect(neighborsOf("G080140.06")).toEqual([
      "G080140.01", "G080140.02", "G080140.03",
      "G080140.05", "G080140.06", "G080140.07",
      "G080140.09", "G080140.10", "G080140.11",
    ]);
  });

  it("crosses 1° boundaries: the south-west corner cell has neighbors in three other 1° cells", () => {
    const ids = neighborsOf("G080140.01");
    expect(ids).toEqual([
      "G079139.16", "G079140.13", "G079140.14",
      "G080139.04", "G080140.01", "G080140.02",
      "G080139.08", "G080140.05", "G080140.06",
    ]);
  });

  it("crosses the north-east corner too, and the block is 0.75° on each side around the cell", () => {
    const ids = neighborsOf("G080140.16");
    expect(ids[8]).toBe("G081141.01");
    expect(ids[4]).toBe("G080140.16");
    const block = unionBounds(ids.map(cellBounds));
    const center = cellBounds("G080140.16");
    expect(block).toEqual({
      west: center.west - 0.25,
      south: center.south - 0.25,
      east: center.east + 0.25,
      north: center.north + 0.25,
    });
    expect(new Set(ids).size).toBe(9);
  });

  it("rejects malformed IDs", () => {
    expect(() => neighborsOf("G080140.17")).toThrow();
    expect(() => neighborsOf("G080140.16.01")).toThrow();
  });
});
