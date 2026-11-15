import { useRemote, type Remote } from "./api";
import type { Bounds, Period } from "../state/dashboard";

/**
 * Days of one month for an area (redesign, calendar "month" view): NATIVE detections of one satellite per local solar
 * day, never harmonized (the harmonized series exists per month only). Served by `GET /api/daily`
 * (app/backend/astro_dashboard/daily.py).
 */
export type DailyPass = {
  satellite: string; // "Aqua" | "Terra" | "SNPP" | "N20"
  daynight: "D" | "N";
  /** First and last acquisition time of the pass, UTC "HH:MM". */
  start_utc: string;
  end_utc: string;
  /** Same times as local solar time "HH:MM" (UTC + longitude/15 of the area center). */
  start_local: string;
  end_local: string;
  count: number;
};

export type DailyDay = {
  date: string; // YYYY-MM-DD, local solar date
  /** "observed": inside the data; count may be 0 (no detection, not "no fire"). "no_data": after the last day of data. */
  status: "observed" | "no_data";
  count: number | null;
  passes: DailyPass[];
};

export type DailyResponse = {
  year: number;
  month: number;
  period: Period;
  /** Satellite counted (the month's source satellite unless `satellite` was asked). */
  satellite: string;
  instrument: "MODIS" | "VIIRS";
  cells: number;
  /** Last local solar date with data in the archive (e.g. "2026-11-14"). */
  last_date: string;
  days: DailyDay[];
};

export type DailyRequest = { area: Bounds; year: number; month: number; period: Period; satellite?: string };

export function dailyUrl({ area, year, month, period, satellite }: DailyRequest): string {
  const params = new URLSearchParams({
    west: String(area.west),
    south: String(area.south),
    east: String(area.east),
    north: String(area.north),
    year: String(year),
    month: String(month),
    period,
  });
  if (satellite) params.set("satellite", satellite);
  return `/api/daily?${params}`;
}

export function useDaily(request: DailyRequest | null): Remote<DailyResponse> {
  return useRemote<DailyResponse>(request ? dailyUrl(request) : null);
}
