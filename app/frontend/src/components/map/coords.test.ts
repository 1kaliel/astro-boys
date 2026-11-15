import { describe, expect, it } from "vitest";
import { circleBox, circleRing } from "../../lib/area";
import { PILOT_BOUNDS } from "../../state/dashboard";
import {
  checkPoint,
  circleGeoJSON,
  formatPointCoord,
  monthCountText,
  monthCountUrl,
  monthRange,
  parseCoordinate,
  parseLatLon,
  pointArea,
  pointLabel,
} from "./coords";

describe("circle to box", () => {
  it("is lat ± r/110.57 and lon ± r/(111.32 cos lat)", () => {
    const b = circleBox(-9.5, -40.2, 25);
    expect(b.north - -9.5).toBeCloseTo(25 / 110.57, 10);
    expect(-9.5 - b.south).toBeCloseTo(25 / 110.57, 10);
    const dLon = 25 / (111.32 * Math.cos((-9.5 * Math.PI) / 180));
    expect(b.east - -40.2).toBeCloseTo(dLon, 10);
    expect(-40.2 - b.west).toBeCloseTo(dLon, 10);
  });

  it("is a square at the equator, wider in longitude away from it", () => {
    const eq = circleBox(0, 0, 100);
    expect(eq.east - eq.west).toBeCloseTo((2 * 100) / 111.32, 10);
    const south = circleBox(-60, 0, 100);
    expect(south.east - south.west).toBeCloseTo(2 * (eq.east - eq.west), 6);
  });

  it("stays on the Earth near a pole", () => {
    const b = circleBox(89.9, 10, 100);
    expect(b.north).toBe(90);
    expect(b.west).toBeGreaterThanOrEqual(-180);
    expect(b.east).toBeLessThanOrEqual(180);
  });

  it("draws a closed ring that touches the box edges", () => {
    const ring = circleRing(-9.5, -40.2, 50, 64);
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
    const b = circleBox(-9.5, -40.2, 50);
    const lons = ring.map((p) => p[0]);
    const lats = ring.map((p) => p[1]);
    expect(Math.max(...lons)).toBeCloseTo(b.east, 10);
    expect(Math.min(...lons)).toBeCloseTo(b.west, 10);
    expect(Math.max(...lats)).toBeCloseTo(b.north, 10);
    expect(Math.min(...lats)).toBeCloseTo(b.south, 10);
    expect(circleGeoJSON({ lat: -9.5, lon: -40.2, radiusKm: 50 }).features).toHaveLength(1);
    expect(circleGeoJSON(null).features).toHaveLength(0);
  });
});

describe("parsing typed coordinates", () => {
  it("reads decimal degrees, typographic minus, decimal comma and hemispheres", () => {
    expect(parseCoordinate("-9.45")).toBe(-9.45);
    expect(parseCoordinate(" −9,45 ")).toBe(-9.45);
    expect(parseCoordinate("9.45 S")).toBe(-9.45);
    expect(parseCoordinate("40.2°W")).toBe(-40.2);
    expect(parseCoordinate("5N")).toBe(5);
    expect(parseCoordinate("-5 N")).toBe(5);
    expect(parseCoordinate("-9.45 S")).toBe(-9.45);
    expect(parseCoordinate("9.45S")).toBe(-9.45);
    expect(parseCoordinate("40.2 W")).toBe(-40.2);
    expect(parseCoordinate("-40.2W")).toBe(-40.2);
    expect(parseCoordinate("+.5")).toBe(0.5);
  });

  it("rejects what is not one number", () => {
    expect(parseCoordinate("")).toBeNull();
    expect(parseCoordinate("abc")).toBeNull();
    expect(parseCoordinate("1.2.3")).toBeNull();
    expect(parseCoordinate("-9.45, -40.2")).toBeNull();
  });

  it("reads a pasted lat, lon pair", () => {
    expect(parseLatLon("-9.45, -40.2")).toEqual({ lat: -9.45, lon: -40.2 });
    expect(parseLatLon("-9.45 -40.2")).toEqual({ lat: -9.45, lon: -40.2 });
    expect(parseLatLon("-9.45;-40.2")).toEqual({ lat: -9.45, lon: -40.2 });
    expect(parseLatLon("-9.45,-40.2")).toEqual({ lat: -9.45, lon: -40.2 });
    expect(parseLatLon("-9,45 -40,2")).toEqual({ lat: -9.45, lon: -40.2 });
    expect(parseLatLon("9.45 S 40.2 W")).toEqual({ lat: -9.45, lon: -40.2 });
    expect(parseLatLon("-9.45")).toBeNull();
    expect(parseLatLon("-9,45")).toBeNull();
  });
});

describe("checking a point", () => {
  it("accepts a point in the study area", () => {
    expect(checkPoint("-9.45", "-40.2", PILOT_BOUNDS)).toEqual({ ok: true, lat: -9.45, lon: -40.2 });
  });

  it("asks for both fields and for numbers", () => {
    expect(checkPoint("", "-40", PILOT_BOUNDS)).toMatchObject({ ok: false, message: "Enter a latitude and a longitude." });
    expect(checkPoint("x", "-40", PILOT_BOUNDS)).toMatchObject({ ok: false, message: expect.stringContaining("latitude is not a number") });
    expect(checkPoint("-9", "y", PILOT_BOUNDS)).toMatchObject({ ok: false, message: expect.stringContaining("longitude is not a number") });
  });

  it("rejects impossible coordinates", () => {
    expect(checkPoint("-91", "-40", PILOT_BOUNDS)).toMatchObject({ ok: false, message: expect.stringContaining("-90 and 90") });
    expect(checkPoint("-9", "181", PILOT_BOUNDS)).toMatchObject({ ok: false, message: expect.stringContaining("-180 and 180") });
  });

  it("rejects a point outside the study area with a clear message", () => {
    const check = checkPoint("-23.55", "-46.63", PILOT_BOUNDS); // São Paulo
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toMatch(/outside the study area \(Northeast Brazil/);
  });
});

describe("the area of a point", () => {
  it("is the box around the circle when it fits in the study area", () => {
    const point = { lat: -9.5, lon: -40.2, radiusKm: 25 };
    const result = pointArea(point, PILOT_BOUNDS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const box = circleBox(-9.5, -40.2, 25);
      for (const edge of ["west", "south", "east", "north"] as const) expect(result.area[edge]).toBeCloseTo(box[edge], 2);
      expect(result.clamped).toBe(false);
      expect(result.cells).toBeGreaterThan(0);
    }
  });

  it("is clamped to the study area near its edge", () => {
    const result = pointArea({ lat: -1.1, lon: -34.8, radiusKm: 100 }, PILOT_BOUNDS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.clamped).toBe(true);
      expect(result.area.north).toBe(PILOT_BOUNDS.north);
      expect(result.area.east).toBe(PILOT_BOUNDS.east);
    }
  });

  it("is labeled with the radius and the point", () => {
    expect(pointLabel({ lat: -9.45123456, lon: -40.2, radiusKm: 50 })).toBe("50 km around -9.4512, -40.2 (box)");
    expect(formatPointCoord(-0.00001)).toBe("0");
  });
});

describe("the month count", () => {
  it("spans the first to the last day of the month", () => {
    expect(monthRange(2024, 2)).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(monthRange(2023, 2)).toEqual({ start: "2023-02-01", end: "2023-02-28" });
    expect(monthRange(2013, 9)).toEqual({ start: "2013-09-01", end: "2013-09-30" });
    expect(monthRange(2013, 12)).toEqual({ start: "2013-12-01", end: "2013-12-31" });
  });

  it("asks /api/hotspots/count for the area, the month and the period", () => {
    const url = monthCountUrl({ area: { west: -41, south: -10, east: -40, north: -9 }, year: 2013, month: 9, period: "N" });
    const [path, query] = url.split("?");
    expect(path).toBe("/api/hotspots/count");
    const params = new URLSearchParams(query);
    expect(Object.fromEntries(params)).toEqual({
      start: "2013-09-01",
      end: "2013-09-30",
      west: "-41",
      south: "-10",
      east: "-40",
      north: "-9",
      period: "N",
    });
    const filtered = new URLSearchParams(
      monthCountUrl({ area: { west: -41, south: -10, east: -40, north: -9 }, year: 2013, month: 9, period: "ALL", minFrp: 50, relevance: "h" }).split("?")[1],
    );
    expect(filtered.get("min_frp")).toBe("50");
    expect(filtered.get("min_confidence")).toBe("h");
  });

  it("words the count, and never shows a capped count as a total", () => {
    expect(monthCountText({ rows: 1234, max_rows: 500_000, over_limit: false }, 2013, 9)).toEqual({
      value: "1,234",
      label: "native detections, September 2013",
    });
    expect(monthCountText({ rows: 1, max_rows: 500_000 }, 2013, 9).label).toBe("native detection, September 2013");
    expect(monthCountText({ rows: 0, max_rows: 500_000 }, 2013, 9).value).toBe("No");
    expect(monthCountText({ rows: 500_001, max_rows: 500_000, over_limit: true }, 2013, 9)).toEqual({
      value: "More than 500,000",
      label: "native detections, September 2013",
    });
  });
});
