import { describe, expect, it } from "vitest";
import type { CellValue } from "../data/api";
import { boundsToPolygon, cellsToTiles, cornersToBounds, describeBounds, gibsTileUrl, isSingleCell, tileAltitude } from "./globe";
import { cellBounds } from "./grid";

describe("cornersToBounds", () => {
  it("widens the rectangle outward to whole 0.25 degree cells", () => {
    expect(cornersToBounds({ lat: -9.9, lng: -40.3 }, { lat: -9.2, lng: -39.6 })).toEqual({
      south: -10,
      north: -9,
      west: -40.5,
      east: -39.5,
    });
  });

  it("does not depend on which corner was clicked first", () => {
    const a = { lat: -9.9, lng: -40.3 };
    const b = { lat: -9.2, lng: -39.6 };
    expect(cornersToBounds(a, b)).toEqual(cornersToBounds(b, a));
  });

  it("keeps a rectangle that is already on the grid as it is", () => {
    expect(cornersToBounds({ lat: -10, lng: -40 }, { lat: -9, lng: -39 })).toEqual({
      south: -10,
      north: -9,
      west: -40,
      east: -39,
    });
  });

  it("turns two clicks in the same cell into that one cell", () => {
    const bounds = cornersToBounds({ lat: -9.9, lng: -39.9 }, { lat: -9.8, lng: -39.8 });
    expect(isSingleCell(bounds)).toBe(true);
    expect(bounds).toEqual({ south: -10, north: -9.75, west: -40, east: -39.75 });
  });

  it("stays inside valid coordinates", () => {
    const bounds = cornersToBounds({ lat: -95, lng: -190 }, { lat: 95, lng: 190 });
    expect(bounds).toEqual({ south: -90, north: 90, west: -180, east: 180 });
  });
});

describe("cellsToTiles", () => {
  const breaks = [10, 20, 30];
  const cells: CellValue[] = [
    { id: "G078141.06", value: 5, estimated: true, partial: false },
    { id: "G078141.07", value: 25, estimated: false, partial: true },
    { id: "G078141.08", value: 0, estimated: false, partial: false },
  ];

  it("draws only cells with detections: a cell with none is not drawn", () => {
    expect(cellsToTiles(cells, breaks).map((tile) => tile.id)).toEqual(["G078141.06", "G078141.07"]);
  });

  it("anchors a tile at the south-west corner of its cell", () => {
    const [tile] = cellsToTiles(cells, breaks);
    const bounds = cellBounds("G078141.06");
    expect([tile.lat, tile.lng]).toEqual([bounds.south, bounds.west]);
  });

  it("gives a stronger class a higher ramp step, from 1 up to 7", () => {
    const [low, high] = cellsToTiles(cells, breaks);
    expect(low.step).toBe(1);
    expect(high.step).toBeGreaterThan(low.step);
    expect(high.step).toBeLessThanOrEqual(7);
  });

  it("keeps the provenance flags", () => {
    const [estimated, partial] = cellsToTiles(cells, breaks);
    expect(estimated.estimated).toBe(true);
    expect(partial.partial).toBe(true);
  });

  it("stands a stronger step a little higher", () => {
    expect(tileAltitude(7)).toBeGreaterThan(tileAltitude(1));
    expect(tileAltitude(1)).toBeGreaterThan(0);
  });
});

describe("helpers", () => {
  it("closes the polygon of an area", () => {
    const ring = boundsToPolygon({ south: -10, north: -9, west: -40, east: -39 }).coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });

  it("describes an area with hemispheres", () => {
    expect(describeBounds({ south: -10, north: -9.5, west: -40.5, east: -39 })).toBe("10°S to 9.5°S, 40.5°W to 39°W");
  });

  it("builds a NASA GIBS tile URL (row before column)", () => {
    expect(gibsTileUrl(11, 16, 5)).toContain("/GoogleMapsCompatible_Level8/5/16/11.jpeg");
  });
});
