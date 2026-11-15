import { describe, expect, it } from "vitest";
import type { MunicipalitiesGeoJSON, MunicipalitiesWeather } from "../data/api";
import { FEELS_LIKE_BREAKS, centroidPoints, coverage, joinWeather } from "./municipalities";

const poly = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
} as const;
const geo = {
  type: "FeatureCollection",
  state: { uf: "ce", name: "Ceará", code: 23 },
  bounds: { west: 0, south: 0, east: 1, north: 1 },
  features: [
    { type: "Feature", geometry: poly, properties: { code: "1", name: "Alfa", lon: 0.5, lat: 0.4 } },
    { type: "Feature", geometry: poly, properties: { code: "2", name: "Beta", lon: 0.6, lat: 0.3 } },
  ],
} as unknown as MunicipalitiesGeoJSON;
const weather = {
  items: [
    { code: "1", apparent_temperature_c: 29.9, temperature_c: 26, humidity_pct: 70, wind_speed_kmh: 12 },
    { code: "2", apparent_temperature_c: null, temperature_c: 25, humidity_pct: null, wind_speed_kmh: null },
  ],
} as unknown as MunicipalitiesWeather;

describe("municipalities", () => {
  it("joins the weather by IBGE code", () => {
    const joined = joinWeather(geo, weather);
    expect(joined.features[0].properties).toEqual({
      code: "1",
      name: "Alfa",
      feels: 29.9,
      temperature: 26,
      humidity: 70,
      wind: 12,
    });
  });

  it("leaves a missing value out instead of drawing it as zero", () => {
    const joined = joinWeather(geo, weather);
    expect("feels" in joined.features[1].properties).toBe(false);
    expect(joined.features[1].properties.temperature).toBe(25);
    expect(coverage(joined)).toEqual({ with: 1, total: 2 });
    // Without any weather every municipality is still drawn, just with no value.
    expect(coverage(joinWeather(geo, null))).toEqual({ with: 0, total: 2 });
  });

  it("a true zero is kept as a value", () => {
    const w = {
      items: [{ code: "1", apparent_temperature_c: 0, temperature_c: null, humidity_pct: null, wind_speed_kmh: null }],
    } as unknown as MunicipalitiesWeather;
    expect(joinWeather(geo, w).features[0].properties.feels).toBe(0);
  });

  it("puts one point at the centroid of each municipality, in lon/lat order, with the same properties", () => {
    const points = centroidPoints(geo, joinWeather(geo, weather));
    expect(points.features[0].geometry.coordinates).toEqual([0.5, 0.4]);
    expect(points.features[0].properties.name).toBe("Alfa");
    expect(points.features).toHaveLength(2);
  });

  it("the class limits are strictly increasing", () => {
    expect([...FEELS_LIKE_BREAKS].every((v, i, a) => i === 0 || v > a[i - 1])).toBe(true);
  });
});
