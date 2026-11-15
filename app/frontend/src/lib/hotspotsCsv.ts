import type { Bounds, Period } from "../state/dashboard";

/** What the CSV download (D6) asks for: the dashboard's area, years and time of day. */
export type HotspotsRequest = {
  area: Bounds;
  startYear: number;
  endYear: number;
  period: Period;
  /** Every detection, not only those that pass the main filter (the ones the calendar counts). */
  includeAll: boolean;
};

/** Answer of `GET /api/hotspots/count` (app/backend/astro_dashboard/api.py). */
export type HotspotsCount = {
  rows: number;
  max_rows: number;
  cells: number;
  start: string;
  end: string;
  period: Period;
  include_all: boolean;
};

/**
 * Query string shared by `/api/hotspots/count` and `/api/hotspots.csv`. Years become local solar dates,
 * 1 January of the first year to 31 December of the last, like the calendar's months.
 */
export function hotspotsQuery(request: HotspotsRequest): string {
  const params = new URLSearchParams({
    west: String(request.area.west),
    south: String(request.area.south),
    east: String(request.area.east),
    north: String(request.area.north),
    start: `${request.startYear}-01-01`,
    end: `${request.endYear}-12-31`,
    period: request.period,
  });
  if (request.includeAll) params.set("include_all", "true");
  return params.toString();
}

export const hotspotsCountUrl = (request: HotspotsRequest) => `/api/hotspots/count?${hotspotsQuery(request)}`;
export const hotspotsCsvUrl = (request: HotspotsRequest) => `/api/hotspots.csv?${hotspotsQuery(request)}`;
