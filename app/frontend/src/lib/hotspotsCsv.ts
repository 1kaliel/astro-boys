import type { Bounds, Period } from "../state/dashboard";

/** What the CSV download (D6) asks for: the dashboard's area, years and time of day. */
export type HotspotsRequest = {
  area: Bounds;
  startYear: number;
  endYear: number;
  period: Period;
  /** Every detection, not only those that pass the main filter (the ones the calendar counts). */
  includeAll: boolean;
  /** Intensity (minimum FRP, MW) and relevance (lowest confidence class); defaults keep everything. */
  minFrp?: number;
  relevance?: "l" | "n" | "h";
};

/** Answer of `GET /api/hotspots/count` (app/backend/astro_dashboard/api.py). */
export type HotspotsCount = {
  /** Exact when `over_limit` is false. When true the server stopped counting at `max_rows + 1`: not a total. */
  rows: number;
  /** More than `max_rows` match. Absent in answers of older servers: then `rows > max_rows` says it. */
  over_limit?: boolean;
  max_rows: number;
  cells: number;
  start: string;
  end: string;
  period: Period;
  include_all: boolean;
  min_frp?: number | null;
  min_confidence?: "l" | "n" | "h";
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
  if (request.minFrp) params.set("min_frp", String(request.minFrp));
  if (request.relevance && request.relevance !== "l") params.set("min_confidence", request.relevance);
  return params.toString();
}

export const hotspotsCountUrl = (request: HotspotsRequest) => `/api/hotspots/count?${hotspotsQuery(request)}`;
export const hotspotsCsvUrl = (request: HotspotsRequest) => `/api/hotspots.csv?${hotspotsQuery(request)}`;

/** True when the selection is too large for one file. Never trust `rows` as a total in that case. */
export const isOverLimit = (count: Pick<HotspotsCount, "rows" | "max_rows" | "over_limit">): boolean =>
  count.over_limit ?? count.rows > count.max_rows;

export type YearSuggestion = { label: string; startYear: number; endYear: number };

/** Narrower year ranges to offer when the selection is too large: the latest 5 years, then the last year alone. */
export function narrowerYearRanges(startYear: number, endYear: number): YearSuggestion[] {
  const suggestions: YearSuggestion[] = [];
  if (endYear - startYear + 1 > 5) {
    suggestions.push({ label: "Latest 5 years", startYear: endYear - 4, endYear });
  }
  if (endYear > startYear) {
    suggestions.push({ label: `Only ${endYear}`, startYear: endYear, endYear });
  }
  return suggestions;
}
