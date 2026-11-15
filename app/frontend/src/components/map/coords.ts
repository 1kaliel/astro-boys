import { checkArea, circleBox, circleRing } from "../../lib/area";
import { formatCount, MONTHS_LONG } from "../../lib/format";
import type { Bounds } from "../../lib/grid";
import type { HotspotsCount } from "../../lib/hotspotsCsv";
import { isOverLimit } from "../../lib/hotspotsCsv";
import type { Period, PointSearch } from "../../state/dashboard";

/** Radii offered by the coordinate search, in km. */
export const RADII_KM = [10, 25, 50, 100] as const;
export type RadiusKm = (typeof RADII_KM)[number];
export const DEFAULT_RADIUS_KM: RadiusKm = 25;

const pointFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4, useGrouping: false });

/** "-9.4512" for a point coordinate: at most 4 decimals (about 11 m), en-US decimal point. */
export function formatPointCoord(value: number): string {
  const text = pointFormat.format(value);
  return text === "-0" ? "0" : text;
}

/**
 * One decimal-degree coordinate typed by a person: "-9.45", "−9,45" (typographic minus, decimal comma), "9.45 S",
 * "40.2W", "9.45°S". S and W make it negative. Null when it is not a number.
 */
export function parseCoordinate(text: string): number | null {
  let s = text.trim().replace(/−/g, "-").replace(/°/g, "").replace(/\s+/g, "");
  if (!s) return null;
  // A hemisphere letter sets the sign whatever was typed: "-9.45 S" and "9.45S" are both south.
  let hemisphereSign: 1 | -1 | null = null;
  const hemisphere = /^(.*?)([NSEWnsew])$/.exec(s);
  if (hemisphere) {
    s = hemisphere[1];
    hemisphereSign = /[SWsw]/.test(hemisphere[2]) ? -1 : 1;
  }
  // A single comma is a decimal comma ("-9,45"); a point stays a point.
  if (/^[-+]?\d+,\d+$/.test(s)) s = s.replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const typed = Number(s);
  const value = hemisphereSign === null ? typed : hemisphereSign * Math.abs(typed);
  return Number.isFinite(value) ? value : null;
}

/**
 * A pasted pair, "lat, lon": "-9.45, -40.2", "-9.45 -40.2", "-9.45; -40.2", "9.45 S 40.2 W". Null unless it holds
 * exactly two coordinates.
 */
export function parseLatLon(text: string): { lat: number; lon: number } | null {
  const s = text.trim().replace(/−/g, "-").replace(/°/g, "");
  // ";" or ", " always separate; a bare "," only when the numbers use decimal points ("-9.45,-40.2"), since
  // "-9,45" alone is one number with a decimal comma.
  let parts = s.split(/\s*;\s*|,\s+/);
  if (parts.length !== 2 && s.includes(".")) parts = s.split(/\s*,\s*/);
  if (parts.length !== 2) parts = s.split(/\s+(?=[-+]?[\d.])/);
  if (parts.length !== 2) return null;
  const lat = parseCoordinate(parts[0]);
  const lon = parseCoordinate(parts[1]);
  return lat === null || lon === null ? null : { lat, lon };
}

export type PointCheck = { ok: true; lat: number; lon: number } | { ok: false; message: string };

/** Checks the typed latitude and longitude: numbers, on the Earth, and inside the study area (the only place with data). */
export function checkPoint(latText: string, lonText: string, frame: Bounds): PointCheck {
  if (!latText.trim() || !lonText.trim()) return { ok: false, message: "Enter a latitude and a longitude." };
  const lat = parseCoordinate(latText);
  const lon = parseCoordinate(lonText);
  if (lat === null) return { ok: false, message: "The latitude is not a number (decimal degrees, e.g. -9.45)." };
  if (lon === null) return { ok: false, message: "The longitude is not a number (decimal degrees, e.g. -40.2)." };
  if (lat < -90 || lat > 90) return { ok: false, message: "The latitude must be between -90 and 90." };
  if (lon < -180 || lon > 180) return { ok: false, message: "The longitude must be between -180 and 180." };
  if (lat < frame.south || lat > frame.north || lon < frame.west || lon > frame.east) {
    return {
      ok: false,
      message: `This point is outside the study area (Northeast Brazil: latitude ${frame.south} to ${frame.north}, longitude ${frame.west} to ${frame.east}). There are no data there.`,
    };
  }
  return { ok: true, lat, lon };
}

export type PointArea = { ok: true; area: Bounds; clamped: boolean; cells: number } | { ok: false; message: string };

/** The area analyzed for a point: the box around its circle, clamped to the study area (`checkArea`). */
export function pointArea(point: PointSearch, frame: Bounds): PointArea {
  const box = circleBox(point.lat, point.lon, point.radiusKm);
  const check = checkArea(box, frame);
  if (!check.ok) return check;
  const clamped = box.west < frame.west || box.south < frame.south || box.east > frame.east || box.north > frame.north;
  // checkArea also rounds the edges to 0.01° (about 1 km), like every other way of choosing an area.
  return { ok: true, area: check.area, clamped, cells: check.cells };
}

/** Name of the area in the filter bar: "25 km around -9.45, -40.2 (box)". */
export function pointLabel(point: PointSearch): string {
  return `${point.radiusKm} km around ${formatPointCoord(point.lat)}, ${formatPointCoord(point.lon)} (box)`;
}

/** First and last day of a month, local solar dates YYYY-MM-DD (the count endpoint's `start` and `end`). */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

export type MonthCountRequest = {
  area: Bounds;
  year: number;
  month: number;
  period: Period;
  minFrp?: number;
  relevance?: "l" | "n" | "h";
};

/** GET /api/hotspots/count for one month of the area (native detections, the main filter). */
export function monthCountUrl({ area, year, month, period, minFrp, relevance }: MonthCountRequest): string {
  const { start, end } = monthRange(year, month);
  const params = new URLSearchParams({
    start,
    end,
    west: String(area.west),
    south: String(area.south),
    east: String(area.east),
    north: String(area.north),
    period,
  });
  if (minFrp) params.set("min_frp", String(minFrp));
  if (relevance && relevance !== "l") params.set("min_confidence", relevance);
  return `/api/hotspots/count?${params}`;
}

/** "1,234 native detections, September 2013"; "More than 500,000 …" when the server stopped counting. */
export function monthCountText(
  count: Pick<HotspotsCount, "rows" | "max_rows" | "over_limit">,
  year: number,
  month: number,
): { value: string; label: string } {
  const label = `native detection${count.rows === 1 && !isOverLimit(count) ? "" : "s"}, ${MONTHS_LONG[month - 1]} ${year}`;
  if (isOverLimit(count)) return { value: `More than ${formatCount(count.max_rows)}`, label };
  return { value: count.rows === 0 ? "No" : formatCount(count.rows), label };
}

/** The circle of the search, as a GeoJSON line (dashed on the map). */
export function circleGeoJSON(point: PointSearch | null): GeoJSON.FeatureCollection {
  if (!point) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: circleRing(point.lat, point.lon, point.radiusKm) },
      },
    ],
  };
}
