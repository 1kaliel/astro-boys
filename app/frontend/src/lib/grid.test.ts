import { describe, expect, it } from "vitest";
import { cellBounds, cellIdAt, cellsInBounds, cellsToGeoJSON, clampBounds } from "./grid";

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
