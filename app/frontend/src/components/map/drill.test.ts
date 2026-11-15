import { describe, expect, it } from "vitest";
import type { DrilldownResponse } from "../../data/api";
import { cellBounds, neighborsOf } from "../../lib/grid";
import { blockBounds, blockGeoJSON, l3GeoJSON, nativeDetections, satelliteName } from "./drill";

const ANSWER: DrilldownResponse = {
  cell: "G080140.06",
  year: 2013,
  month: 9,
  period: "ALL",
  satellite: "SNPP",
  instrument: "VIIRS",
  min_detections: 5,
  subdivided: true,
  neighbors: neighborsOf("G080140.06").map((id, i) => ({ id, count: i === 4 ? 12 : i })),
  l3: [
    { id: "G080140.06.01", count: 9 },
    { id: "G080140.06.16", count: 3 },
  ],
  total: 12,
};

describe("drill-down geometry", () => {
  it("frames the 3 x 3 block before the API answers, counts unknown", () => {
    const fc = blockGeoJSON("G080140.06", null);
    expect(fc.features).toHaveLength(9);
    expect(fc.features.every((f) => f.properties.count === null)).toBe(true);
    expect(fc.features.filter((f) => f.properties.target).map((f) => f.properties.id)).toEqual(["G080140.06"]);
    const b = cellBounds("G080140.06");
    expect(blockBounds("G080140.06")).toEqual({ west: b.west - 0.25, south: b.south - 0.25, east: b.east + 0.25, north: b.north + 0.25 });
  });

  it("puts the native counts on the block once the answer is in, and ignores an answer for another cell", () => {
    expect(blockGeoJSON("G080140.06", ANSWER).features.map((f) => f.properties.count)).toEqual([0, 1, 2, 3, 12, 5, 6, 7, 8]);
    expect(blockGeoJSON("G080140.07", ANSWER).features.every((f) => f.properties.count === null)).toBe(true);
  });

  it("draws the 16 L3 cells, zero where the API lists none, and none when the cell was not subdivided", () => {
    const fc = l3GeoJSON(ANSWER);
    expect(fc.features).toHaveLength(16);
    expect(fc.features[0].properties).toEqual({ id: "G080140.06.01", count: 9 });
    expect(fc.features[15].properties).toEqual({ id: "G080140.06.16", count: 3 });
    expect(fc.features.filter((f) => f.properties.count > 0)).toHaveLength(2);
    expect(l3GeoJSON({ ...ANSWER, subdivided: false, l3: [] }).features).toHaveLength(0);
    expect(l3GeoJSON(null).features).toHaveLength(0);
  });
});

describe("drill-down words", () => {
  it("names the satellites of the calendar's coverage", () => {
    expect(satelliteName("SNPP")).toBe("S-NPP");
    expect(satelliteName("N20")).toBe("NOAA-20");
    expect(satelliteName("Aqua")).toBe("Aqua");
    expect(satelliteName("Terra")).toBe("Terra");
    expect(satelliteName("Other")).toBe("Other");
  });

  it("says native detections, singular and plural", () => {
    expect(nativeDetections(1)).toBe("1 native detection");
    expect(nativeDetections(1204)).toBe("1,204 native detections");
  });
});
