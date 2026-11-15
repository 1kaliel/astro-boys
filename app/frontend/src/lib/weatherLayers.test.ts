import { describe, expect, it } from "vitest";
import type { WeatherGridPoint } from "../data/api";
import { TEMPERATURE_BREAKS, WIND_SPEED_BREAKS, breaksOf, unitOf, weatherGeoJSON, windToward } from "./weatherLayers";

const point = (extra: Partial<WeatherGridPoint> = {}): WeatherGridPoint => ({
  lat: -10,
  lon: -40,
  temperature_c: 27.5,
  wind_speed_kmh: 14,
  wind_from_deg: 90,
  days_available: 31,
  ...extra,
});

describe("weather layers", () => {
  it("the arrow points where the wind goes, not where it comes from", () => {
    expect(windToward(90)).toBe(270); // from the east: blowing toward the west
    expect(windToward(270)).toBe(90);
    expect(windToward(0)).toBe(180);
    expect(windToward(200)).toBe(20);
  });

  it("temperature and wind speed use their own fixed limits and units", () => {
    expect(breaksOf("temperature")).toBe(TEMPERATURE_BREAKS);
    expect(breaksOf("wind-speed")).toBe(WIND_SPEED_BREAKS);
    expect(breaksOf("hotspots")).toEqual([]);
    expect(unitOf("temperature")).toBe("°C");
    expect(unitOf("wind-speed")).toBe("km/h");
  });

  it("builds one feature per point with a value, in lon/lat order", () => {
    const fc = weatherGeoJSON([point()], "temperature");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toEqual([-40, -10]);
    expect(fc.features[0].properties.value).toBe(27.5);
    expect(weatherGeoJSON([point()], "wind-speed").features[0].properties.value).toBe(14);
  });

  it("leaves out a point with no value instead of drawing it as zero", () => {
    const points = [point({ temperature_c: null }), point({ wind_from_deg: null }), point()];
    expect(weatherGeoJSON(points, "temperature").features).toHaveLength(2);
    expect(weatherGeoJSON(points, "wind-direction").features).toHaveLength(2);
    expect(weatherGeoJSON([point({ temperature_c: 0 })], "temperature").features[0].properties.value).toBe(0);
  });
});
