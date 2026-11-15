import { useCallback, useEffect, useState } from "react";
import type { Period } from "../state/dashboard";

/** The map endpoint (`/api/cells`, app/backend/astro_dashboard/data.py), following docs/data-dictionary.md.
 * The calendar has its own client: data/calendarSource.ts. */
export type CellValue = {
  id: string;
  value: number;
  estimated: boolean;
  partial: boolean;
  ci_low?: number;
  ci_high?: number;
  satellite?: string;
};

/** What the map shows: the harmonized VIIRS-equivalent count, or the native count of one MODIS or VIIRS satellite. */
export type MapSeries = "harmonized" | "modis" | "viirs";
export type Satellite = "Aqua" | "Terra" | "SNPP" | "N20";

export type CellsResponse = {
  year: number;
  month: number;
  period: Period;
  model_version: string | null;
  simulated: boolean;
  /** Fixed class limits for the map, the same for every month (quantiles of all cell-months). */
  breaks?: number[];
  /** What the values are. The labels of the map come from here, not from the selector, so a late answer is never
   * shown under the name of a newer choice. */
  series?: MapSeries;
  satellite?: Satellite | null;
  available_satellites?: Satellite[];
  /** "none": the series has no data at all in this month (for example VIIRS before February 2012). */
  coverage?: "ok" | "none";
  reason?: string | null;
  cells: CellValue[];
};

/** Last good data is kept while a new request runs, so views dim instead of jumping back to "loading". */
export type Remote<T> = { data: T | null; loading: boolean; error: string | null; retry: () => void };

type State<T> = Omit<Remote<T>, "retry">;

/** Waits between automatic retries when the API is down or answers 5xx (e.g. the backend is still starting). */
const RETRY_DELAYS_MS = [1000, 2000, 4000];

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** GET a JSON resource; refetches when the URL changes, aborts stale requests, retries transient failures. */
export function useRemote<T>(url: string | null): Remote<T> {
  const [state, setState] = useState<State<T>>({ data: null, loading: url !== null, error: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let tries = 0;

    const run = () => {
      setState((previous) => ({ ...previous, loading: true, error: null }));
      fetch(url, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            const body = await response.json().catch(() => null);
            throw new HttpError(body?.detail ?? `Request failed (${response.status})`, response.status);
          }
          return (await response.json()) as T;
        })
        .then((data) => setState({ data, loading: false, error: null }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          // A network error (TypeError) or a 5xx is worth retrying; a 4xx is not.
          const transient = error instanceof TypeError || (error instanceof HttpError && error.status >= 500);
          if (transient && tries < RETRY_DELAYS_MS.length) {
            timer = window.setTimeout(run, RETRY_DELAYS_MS[tries]);
            tries += 1;
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          setState((previous) => ({ data: previous.data, loading: false, error: message }));
        });
    };

    run();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [url, attempt]);

  return { ...state, retry };
}

export function cellsUrl(
  period: Period,
  selected: { year: number; month: number } | null,
  series: MapSeries = "harmonized",
  satellite: Satellite | null = null,
): string {
  const params = new URLSearchParams({ period });
  if (series !== "harmonized") params.set("series", series);
  if (satellite) params.set("satellite", satellite);
  if (selected) {
    params.set("year", String(selected.year));
    params.set("month", String(selected.month));
  }
  return `/api/cells?${params}`;
}

/** ERA5 weather context for an area and a month (`/api/weather`). Context only: it never feeds a hotspot number. */
export type WeatherResponse = {
  source: string;
  model: string;
  year: number;
  month: number;
  start: string;
  end: string;
  available_from: string | null;
  available_through: string | null;
  days_available: number;
  days_requested: number;
  /** "partial": the latest days are not published yet. "unavailable": none of them. */
  status: "ok" | "partial" | "unavailable";
  points_in_area: number;
  points_used: number;
  temperature_mean_c: number | null;
  wind_speed_mean_kmh: number | null;
  /** Where the wind blows FROM (meteorological convention). */
  wind_direction_from_deg: number | null;
  wind_direction_from: string | null;
  /** 1 = always the same direction, near 0 = it keeps changing. */
  wind_direction_steadiness: number | null;
};

export function weatherUrl(
  area: { west: number; south: number; east: number; north: number },
  month: { year: number; month: number },
): string {
  const params = new URLSearchParams({
    year: String(month.year),
    month: String(month.month),
    west: String(area.west),
    south: String(area.south),
    east: String(area.east),
    north: String(area.north),
  });
  return `/api/weather?${params}`;
}

/** ERA5 monthly means at sampled grid points of the area, for the weather map layers (`/api/weather/grid`). */
export type WeatherGridResponse = {
  source: string;
  model: string;
  year: number;
  month: number;
  start: string;
  end: string;
  available_through: string | null;
  days_requested: number;
  status: "ok" | "partial" | "unavailable";
  /** Spacing of the sampled points (a sub-grid of ERA5's 0.25° grid): a sample, not a surface. */
  step_deg: number;
  points: WeatherGridPoint[];
};

export type WeatherGridPoint = {
  lat: number;
  lon: number;
  /** null = no value, never zero. */
  temperature_c: number | null;
  wind_speed_kmh: number | null;
  /** Where the wind blows FROM (meteorological convention). */
  wind_from_deg: number | null;
  days_available: number;
};

export function weatherGridUrl(
  area: { west: number; south: number; east: number; north: number },
  month: { year: number; month: number },
): string {
  return weatherUrl(area, month).replace("/api/weather?", "/api/weather/grid?");
}

/** Live wind for a wide, fixed region (`/api/weather/live`): the weather model's current conditions, every 15 minutes. */
export type LiveWindResponse = {
  source: string;
  region: { west: number; south: number; east: number; north: number };
  /** Spacing of the sampled points: a sample of the model grid, not a surface. */
  step_deg: number;
  fetched_at: string;
  /** The latest model time the service reported (UTC, ISO). */
  model_time: string | null;
  interval_seconds: number;
  ttl_seconds: number;
  /** true = the service could not be reached (or the daily budget is spent): this is the last good answer. */
  stale: boolean;
  stale_reason: string | null;
  points: LiveWindPoint[];
};

export type LiveWindPoint = {
  lat: number;
  lon: number;
  temperature_c: number | null;
  wind_speed_kmh: number | null;
  /** Where the wind blows FROM (meteorological convention). */
  wind_from_deg: number | null;
  gust_kmh: number | null;
};

/** Municipalities of a state (IBGE) as GeoJSON, with the centroid on each feature (`/api/municipalities/{uf}`). */
export type MunicipalitiesGeoJSON = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { code: string; name: string; lon: number; lat: number }
> & {
  state: { uf: string; name: string; code: number };
  bounds: { west: number; south: number; east: number; north: number };
};

/** Current feels-like temperature at the centroid of each municipality: model values, not station readings. */
export type MunicipalitiesWeather = {
  source: string;
  uf: string;
  fetched_at: string;
  model_time: string | null;
  interval_seconds: number;
  ttl_seconds: number;
  /** true = the weather service could not be reached (or the daily budget is spent): the last good answer. */
  stale: boolean;
  stale_reason: string | null;
  items: MunicipalWeatherItem[];
};

export type MunicipalWeatherItem = {
  code: string;
  /** null = no value, never zero. */
  apparent_temperature_c: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  wind_speed_kmh: number | null;
};

export const municipalitiesUrl = (uf: string) => `/api/municipalities/${uf}`;
export const municipalitiesWeatherUrl = (uf: string) => `/api/municipalities/${uf}/weather`;

/** The Brazilian states (IBGE) as GeoJSON: the name of a clicked region and its outline (`/api/regions/states`). */
export type StatesGeoJSON = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { code: string; uf: string; name: string; region: string | null }
>;

export const STATES_URL = "/api/regions/states";

/** ERA5 monthly means on the lattice of the live field: the weather of a past month (`/api/weather/month`). */
export type MonthFieldResponse = {
  source: string;
  model: string;
  year: number;
  month: number;
  start: string;
  end: string;
  available_through: string | null;
  days_requested: number;
  /** "partial": the latest days are not published yet. "unavailable": none of them. */
  status: "ok" | "partial" | "unavailable";
  step_deg: number;
  points: MonthFieldPoint[];
};

export type MonthFieldPoint = {
  lat: number;
  lon: number;
  /** null = no value, never zero. */
  temperature_c: number | null;
  wind_speed_kmh: number | null;
  /** Where the wind blows FROM, of the month's mean wind vector (null when the winds cancel). */
  wind_from_deg: number | null;
  /** The length of that mean vector (km/h): the mean flow of the month. */
  wind_flow_kmh: number | null;
  days_available: number;
};

export const weatherMonthUrl = (year: number, month: number) => `/api/weather/month?year=${year}&month=${month}`;

/** Daily native detections of one sensor in an area (`/api/hotspots/daily`), for the Skyline view. */
export type DailyHotspotsResponse = {
  sensor: string;
  sensor_name: string;
  period: Period;
  start: string;
  end: string;
  cells: number;
  /**
   * Native (not harmonized) counts of one sensor, on the days it was observing. A day of the range that is in neither
   * list is a measured zero, but only when `coverage_checked` is true.
   */
  days: { date: string; count: number }[];
  /** Days the sensor was not observing (coverage_daily): no data, never zero. `count`: detections recorded anyway. */
  missing_days: { date: string; status: "missing" | "not_operating"; count: number }[];
  /** False when the coverage could not be read: then no day without detections is a verified zero. */
  coverage_checked: boolean;
};

export function hotspotsDailyUrl(
  sensor: string,
  area: { west: number; south: number; east: number; north: number },
  year: number,
  period: Period,
): string {
  const params = new URLSearchParams({
    sensor,
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    period,
    west: String(area.west),
    south: String(area.south),
    east: String(area.east),
    north: String(area.north),
  });
  return `/api/hotspots/daily?${params}`;
}
