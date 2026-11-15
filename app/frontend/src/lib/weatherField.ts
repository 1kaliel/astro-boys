import type { LiveWindResponse, MonthFieldResponse } from "../data/api";
import { MONTHS_LONG } from "./format";

/** One sample of the field the overview draws, whether it is the weather now or the weather of a past month. */
export type FieldPoint = {
  lat: number;
  lon: number;
  temperature_c: number | null;
  /** Mean wind speed (km/h): what the "Region weather" card reports. */
  wind_speed_kmh: number | null;
  /** Where the wind blows FROM. */
  wind_from_deg: number | null;
  /**
   * The speed the streaks move at (km/h). Live: the wind speed. A month: the length of the month's mean wind vector,
   * the mean flow, which is never more than the mean speed.
   */
  flow_kmh: number | null;
};

/**
 * What the overview is showing, and everything the page has to say about it: the surface, the streaks, the legends and
 * the "Region weather" card all read this one object, so they can never describe different periods.
 */
export type WeatherField = {
  kind: "live" | "month";
  points: FieldPoint[];
  step_deg: number;
  source: string;
  /** The model, in words. */
  model: string;
  /** The period, in words: "2026-11-15 10:00 UTC" or "Monthly mean of October 2015". */
  reference: string;
  /** What to call the wind: "Latest available wind" or "Historical wind". */
  windLabel: string;
  /** What to call the temperature: "now" or "monthly mean". */
  temperatureLabel: string;
  stale: boolean;
  staleReason: string | null;
  /** Seconds the server keeps a live answer (live only). */
  ttlSeconds: number | null;
  /** Month only: "partial" when the latest days of the month are not published yet. */
  status: "ok" | "partial" | "unavailable";
  availableThrough: string | null;
};

const utc = (iso: string | null) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "unknown time");

/** The live answer as a field: the weather now. */
export function liveField(live: LiveWindResponse): WeatherField {
  return {
    kind: "live",
    points: live.points.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      temperature_c: p.temperature_c,
      wind_speed_kmh: p.wind_speed_kmh,
      wind_from_deg: p.wind_from_deg,
      flow_kmh: p.wind_speed_kmh,
    })),
    step_deg: live.step_deg,
    source: "Open-Meteo Forecast API",
    model: "Open-Meteo weather model, current conditions (best match)",
    reference: utc(live.model_time),
    windLabel: "Latest available wind",
    temperatureLabel: "now",
    stale: live.stale,
    staleReason: live.stale_reason,
    ttlSeconds: live.ttl_seconds,
    status: "ok",
    availableThrough: null,
  };
}

/** A past month as a field: the ERA5 monthly means, with the mean flow for the streaks. */
export function monthField(month: MonthFieldResponse): WeatherField {
  const name = `${MONTHS_LONG[month.month - 1]} ${month.year}`;
  return {
    kind: "month",
    points: month.points.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      temperature_c: p.temperature_c,
      wind_speed_kmh: p.wind_speed_kmh,
      wind_from_deg: p.wind_from_deg,
      flow_kmh: p.wind_flow_kmh,
    })),
    step_deg: month.step_deg,
    source: "Open-Meteo Historical Weather API (ERA5)",
    model: "ERA5 reanalysis (models=era5)",
    reference: `Monthly mean of ${name} (UTC days)`,
    windLabel: "Historical wind",
    temperatureLabel: "monthly mean",
    stale: false,
    staleReason: null,
    ttlSeconds: null,
    status: month.status,
    availableThrough: month.available_through,
  };
}

/**
 * The field for the month on screen. A month answer is used only if it IS that month: the page keeps the last good
 * answer while a new request runs, and the weather of another month under this month's label would be a lie.
 */
export function fieldFor(
  hotspots: { year: number; month: number } | null,
  current: { year: number; month: number },
  live: LiveWindResponse | null,
  month: MonthFieldResponse | null,
): WeatherField | null {
  if (!hotspots) return live ? liveField(live) : null;
  if (hotspots.year === current.year && hotspots.month === current.month) return live ? liveField(live) : null;
  return month && month.year === hotspots.year && month.month === hotspots.month ? monthField(month) : null;
}
