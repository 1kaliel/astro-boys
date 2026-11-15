import type { MunicipalitiesGeoJSON, MunicipalitiesWeather } from "../data/api";

/**
 * Fixed classes of the feels-like temperature (°C), the same at any hour. They only split the range; they are not
 * comfort or alert thresholds, and no color here means danger.
 */
export const FEELS_LIKE_BREAKS = [22, 24, 26, 28, 30, 32] as const;

export type MunicipalProps = {
  code: string;
  name: string;
  /** Feels-like temperature, °C. Left out (not 0) when the model gave no value. */
  feels?: number;
  temperature?: number;
  humidity?: number;
  wind?: number;
};

/** The municipality polygons with their current weather joined by IBGE code; a municipality with no value keeps none. */
export function joinWeather(
  geo: MunicipalitiesGeoJSON,
  weather: MunicipalitiesWeather | null,
): GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, MunicipalProps> {
  const byCode = new Map(weather?.items.map((item) => [item.code, item]));
  return {
    type: "FeatureCollection",
    features: geo.features.map((feature) => {
      const w = byCode.get(feature.properties.code);
      const props: MunicipalProps = { code: feature.properties.code, name: feature.properties.name };
      if (w?.apparent_temperature_c != null) props.feels = w.apparent_temperature_c;
      if (w?.temperature_c != null) props.temperature = w.temperature_c;
      if (w?.humidity_pct != null) props.humidity = w.humidity_pct;
      if (w?.wind_speed_kmh != null) props.wind = w.wind_speed_kmh;
      return { type: "Feature", geometry: feature.geometry, properties: props };
    }),
  };
}

/** One point per municipality (its centroid), carrying the same properties: where the model value is taken. */
export function centroidPoints(
  geo: MunicipalitiesGeoJSON,
  joined: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, MunicipalProps>,
): GeoJSON.FeatureCollection<GeoJSON.Point, MunicipalProps> {
  const props = new Map(joined.features.map((f) => [f.properties.code, f.properties]));
  return {
    type: "FeatureCollection",
    features: geo.features.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [f.properties.lon, f.properties.lat] },
      properties: props.get(f.properties.code) ?? { code: f.properties.code, name: f.properties.name },
    })),
  };
}

/** How many municipalities have a value, out of all of them. */
export function coverage(joined: { features: { properties: MunicipalProps }[] }): { with: number; total: number } {
  return {
    with: joined.features.filter((f) => f.properties.feels !== undefined).length,
    total: joined.features.length,
  };
}
