import { describe, expect, it } from "vitest";
import {
  cardinal,
  pointInGeometry,
  regionWeather,
  stateAt,
  type RegionFeature,
  type RegionSample,
} from "./regionWeather";

const square = (x: number, y: number, size: number): GeoJSON.Polygon => ({
  type: "Polygon",
  coordinates: [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ],
  ],
});
const state = (name: string, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): RegionFeature => ({
  geometry,
  properties: { code: "1", uf: "XX", name },
});
const sample = (
  lat: number,
  lon: number,
  t: number | null,
  speed: number | null,
  from: number | null,
): RegionSample => ({
  lat,
  lon,
  temperature_c: t,
  wind_speed_kmh: speed,
  wind_from_deg: from,
});

describe("point in a region", () => {
  it("is inside the outer ring and outside a hole", () => {
    const donut: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [square(0, 0, 10).coordinates[0], square(4, 4, 2).coordinates[0]],
    };
    expect(pointInGeometry(1, 1, donut)).toBe(true);
    expect(pointInGeometry(5, 5, donut)).toBe(false); // in the hole
    expect(pointInGeometry(11, 1, donut)).toBe(false);
  });

  it("finds the state of a point, and none over open sea", () => {
    const states = [state("A", square(0, 0, 5)), state("B", square(10, 0, 5))];
    expect(stateAt(2, 2, states)?.properties.name).toBe("A");
    expect(stateAt(12, 2, states)?.properties.name).toBe("B");
    expect(stateAt(7, 2, states)).toBeNull();
  });

  it("names the compass point of a direction", () => {
    expect([0, 90, 180, 270, 45, 359].map(cardinal)).toEqual(["N", "E", "S", "W", "NE", "N"]);
  });
});

describe("weather of a clicked region", () => {
  const ceara = state("Ceará", square(-41, -8, 4)); // lon -41..-37, lat -8..-4
  it("is the mean of the grid points inside the state, and says how many", () => {
    const answer = regionWeather(
      -39,
      -6,
      [sample(-5, -39, 30, 10, 90), sample(-7, -39, 26, 20, 90), sample(-5, -30, 99, 99, 0)],
      ceara,
      3,
    );
    expect(answer.method).toBe("mean-of-grid-points");
    expect(answer.points).toBe(2); // the point outside the state is not in the mean
    expect(answer.temperature_c).toBeCloseTo(28);
    expect(answer.wind_speed_kmh).toBeCloseTo(15);
    expect(answer.wind_from_deg).toBeCloseTo(90);
    expect(answer.region).toBe("Ceará");
  });

  it("never calls a single sample a mean", () => {
    const answer = regionWeather(-39, -6, [sample(-5, -39, 30, 10, 90)], ceara, 3);
    expect(answer.method).toBe("single-grid-point");
    expect(answer.points).toBe(1);
  });

  it("opposite winds cancel: no prevailing direction is invented", () => {
    const answer = regionWeather(-39, -6, [sample(-5, -39, 30, 10, 0), sample(-7, -39, 30, 10, 180)], ceara, 3);
    expect(answer.wind_speed_kmh).toBeCloseTo(10);
    expect(answer.wind_from_deg).toBeNull();
  });

  it("with no grid point inside takes the nearest one when it is close, and says where it is", () => {
    const answer = regionWeather(-39, -6, [sample(-10, -39, 25, 8, 120)], ceara, 3);
    expect(answer.method).toBe("nearest-grid-point");
    expect(answer.nearest?.lat).toBe(-10);
    expect(answer.nearest?.km).toBeGreaterThan(400);
  });

  it("gives nothing, not a made-up value, when no sample is near", () => {
    const answer = regionWeather(-39, -6, [sample(30, 10, 20, 5, 0)], null, 3);
    expect(answer).toMatchObject({ method: "none", points: 0, temperature_c: null, wind_speed_kmh: null });
  });

  it("a missing temperature stays missing instead of dragging the mean to zero", () => {
    const answer = regionWeather(-39, -6, [sample(-5, -39, 30, 10, 90), sample(-7, -39, null, 10, 90)], ceara, 3);
    expect(answer.temperature_c).toBeCloseTo(30);
    expect(answer.points).toBe(2);
  });
});
