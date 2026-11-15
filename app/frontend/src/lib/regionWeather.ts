import { windVector } from "./windField";

export type RegionSample = {
  lat: number;
  lon: number;
  temperature_c: number | null;
  wind_speed_kmh: number | null;
  wind_from_deg: number | null;
  /** The speed of the mean wind vector (a month: the mean flow). The direction is taken from it when it is there. */
  flow_kmh?: number | null;
};

/** A state of the IBGE mesh: the name and the outline. */
export type RegionFeature = {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: { code: string; uf: string; name: string };
};

const CARDINALS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** 16-point compass name of a direction in degrees. */
export function cardinal(degrees: number): string {
  return CARDINALS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
}

function inRing(lon: number, lat: number, ring: readonly (readonly number[])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Whether a point is inside a polygon or multipolygon (the outer ring in, the holes out). */
export function pointInGeometry(lon: number, lat: number, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((rings) => inRing(lon, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lon, lat, hole)));
}

/** The state that contains a point, or null (open sea, another country). */
export function stateAt(lon: number, lat: number, states: readonly RegionFeature[]): RegionFeature | null {
  return states.find((state) => pointInGeometry(lon, lat, state.geometry)) ?? null;
}

/** How the numbers of a region answer were obtained: the label must say it, a single sample is never a "mean". */
export type RegionMethod = "mean-of-grid-points" | "single-grid-point" | "nearest-grid-point" | "none";

export type RegionAnswer = {
  region: string | null;
  method: RegionMethod;
  /** How many grid points the numbers come from. */
  points: number;
  temperature_c: number | null;
  wind_speed_kmh: number | null;
  /** Where the wind blows FROM, from the mean wind vector of the points (opposite winds cancel). */
  wind_from_deg: number | null;
  /** Nearest-point method only: where that point is and how far from the click (km). */
  nearest?: { lat: number; lon: number; km: number };
};

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function combine(samples: readonly RegionSample[]) {
  const temps = samples.flatMap((s) => (s.temperature_c === null ? [] : [s.temperature_c]));
  const winds = samples.filter((s) => (s.flow_kmh ?? s.wind_speed_kmh) !== null && s.wind_from_deg !== null);
  let east = 0;
  let north = 0;
  for (const s of winds) {
    const { u, v } = windVector((s.flow_kmh ?? s.wind_speed_kmh) as number, s.wind_from_deg as number);
    east += u;
    north += v;
  }
  // The speed is the mean of the speeds; the direction comes from the mean vector (a month: the mean flow).
  const speeds = samples.flatMap((s) => (s.wind_speed_kmh === null ? [] : [s.wind_speed_kmh]));
  const meanSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
  const resultant = winds.length ? Math.hypot(east / winds.length, north / winds.length) : 0;
  return {
    temperature_c: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
    wind_speed_kmh: meanSpeed,
    // From the mean vector: if the winds cancel there is no prevailing direction, and none is invented.
    wind_from_deg:
      winds.length && resultant > 1e-9
        ? ((Math.atan2(-east / winds.length, -north / winds.length) * 180) / Math.PI + 360) % 360
        : null,
  };
}

/**
 * The weather of the place that was clicked. In a state: the mean of the sampled grid points inside its outline (and
 * with a single point inside, that point, labelled as one point). Elsewhere: the nearest grid point, if it is close
 * enough to speak for the click (within 1.5 grid steps). Otherwise nothing: no value is made up.
 */
export function regionWeather(
  lon: number,
  lat: number,
  samples: readonly RegionSample[],
  state: RegionFeature | null,
  stepDeg: number,
): RegionAnswer {
  const region = state?.properties.name ?? null;
  const usable = samples.filter((s) => s.temperature_c !== null || s.wind_speed_kmh !== null);
  if (state) {
    const inside = usable.filter((s) => pointInGeometry(s.lon, s.lat, state.geometry));
    if (inside.length > 0) {
      return {
        region,
        method: inside.length === 1 ? "single-grid-point" : "mean-of-grid-points",
        points: inside.length,
        ...combine(inside),
      };
    }
  }
  let best: { s: RegionSample; km: number } | null = null;
  for (const s of usable) {
    const km = distanceKm(lat, lon, s.lat, s.lon);
    if (!best || km < best.km) best = { s, km };
  }
  if (best && best.km <= 1.5 * stepDeg * 111) {
    return {
      region,
      method: "nearest-grid-point",
      points: 1,
      ...combine([best.s]),
      nearest: { lat: best.s.lat, lon: best.s.lon, km: best.km },
    };
  }
  return { region, method: "none", points: 0, temperature_c: null, wind_speed_kmh: null, wind_from_deg: null };
}
