import type { WeatherGridPoint } from "../data/api";

/** The fields a map layer needs from a point (a month of ERA5, or the live wind). */
export type WeatherSample = Pick<
  WeatherGridPoint,
  "lat" | "lon" | "temperature_c" | "wind_speed_kmh" | "wind_from_deg"
>;

/**
 * What the map shows. "hotspots" (harmonized cells) is the science of the project; "detections" are the native
 * detections behind it; the others are weather context.
 */
export type MapLayer =
  | "hotspots"
  | "detections"
  | "temperature"
  | "wind-speed"
  | "wind-direction"
  | "live-wind"
  | "municipalities";

export const LAYER_LABEL: Record<MapLayer, string> = {
  hotspots: "Hotspots",
  detections: "Detections",
  temperature: "Temperature",
  "wind-speed": "Wind speed",
  "wind-direction": "Wind direction",
  "live-wind": "Live wind",
  municipalities: "Ceará feels like",
};

/**
 * Fixed class limits, the same for every month and area, so months can be compared by eye (like the hotspot map).
 * Chosen for the range ERA5 gives over Northeast Brazil; a value beyond the last limit takes the last color.
 */
export const TEMPERATURE_BREAKS = [20, 22, 24, 26, 28, 30] as const; // °C
export const WIND_SPEED_BREAKS = [8, 12, 16, 20, 24, 28] as const; // km/h

export function breaksOf(layer: MapLayer): readonly number[] {
  return layer === "temperature" ? TEMPERATURE_BREAKS : layer === "wind-speed" ? WIND_SPEED_BREAKS : [];
}

export function unitOf(layer: MapLayer): string {
  return layer === "temperature"
    ? "°C"
    : layer === "wind-speed" || layer === "wind-direction" || layer === "live-wind"
      ? "km/h"
      : "";
}

/** The arrow of the wind points where it blows TOWARD; the direction ERA5 and the card give is where it blows FROM. */
export function windToward(fromDeg: number): number {
  return (fromDeg + 180) % 360;
}

export type WeatherFeatureProps = {
  value: number | null;
  speed: number | null;
  temperature: number | null;
  from: number | null;
  toward: number | null;
};

/** GeoJSON points for a layer. A point with no value for that layer is left out: missing is never drawn as zero. */
export function weatherGeoJSON(
  points: readonly WeatherSample[],
  layer: MapLayer,
): GeoJSON.FeatureCollection<GeoJSON.Point, WeatherFeatureProps> {
  const features: GeoJSON.Feature<GeoJSON.Point, WeatherFeatureProps>[] = [];
  for (const p of points) {
    const value =
      layer === "temperature" ? p.temperature_c : layer === "wind-speed" ? p.wind_speed_kmh : p.wind_speed_kmh;
    const hasDirection = p.wind_from_deg !== null;
    if (value === null || ((layer === "wind-direction" || layer === "live-wind") && !hasDirection)) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: {
        value,
        speed: p.wind_speed_kmh,
        temperature: p.temperature_c,
        from: p.wind_from_deg,
        toward: p.wind_from_deg === null ? null : windToward(p.wind_from_deg),
      },
    });
  }
  return { type: "FeatureCollection", features };
}
