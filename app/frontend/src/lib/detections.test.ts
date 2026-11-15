import { describe, expect, it } from "vitest";
import { pixelSizeM, pointsGeoJSON, pointsUrl, radiusByZoom, type PointsResponse } from "./detections";

describe("detections layer", () => {
  it("asks for one month, the area and the period; the satellite only when chosen", () => {
    const area = { west: -40.5, south: -10.5, east: -39, north: -9.5 };
    const url = pointsUrl(area, { year: 2024, month: 9 }, "N");
    expect(url).toBe("/api/hotspots/points?year=2024&month=9&west=-40.5&south=-10.5&east=-39&north=-9.5&period=N");
    expect(pointsUrl(area, { year: 2005, month: 3 }, "ALL", "Aqua")).toContain("&satellite=Aqua");
  });

  it("turns the compact rows into points", () => {
    const data = { points: [[-39.1, -9.9, 12.5, true]] } as unknown as PointsResponse;
    const fc = pointsGeoJSON(data);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toEqual([-39.1, -9.9]);
    expect(fc.features[0].properties).toEqual({ frp: 12.5, night: true });
    expect(pointsGeoJSON(null).features).toEqual([]);
  });

  it("draws a dot the size of the sensor's pixel once zoomed in, and a minimum size when zoomed out", () => {
    expect(pixelSizeM("SNPP")).toBe(375);
    expect(pixelSizeM("Aqua")).toBe(1000);
    const expr = radiusByZoom(375, 0) as unknown as (string | number | string[])[];
    const stops = expr.slice(3) as number[];
    const at = (z: number) => stops[stops.indexOf(z) + 1];
    expect(at(3)).toBe(1.3); // far smaller than a screen pixel: the minimum
    // At zoom 14 on the equator a screen pixel is about 9.55 m: a 375 m pixel is ~39 px wide, radius ~19.6 px.
    expect(at(14)).toBeCloseTo(19.6, 0);
  });
});
