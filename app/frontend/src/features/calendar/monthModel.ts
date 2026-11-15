import type { CalendarMonth } from "../../data/calendarSource";
import type { DailyDay, DailyPass, DailyResponse } from "../../data/daily";
import { formatCount } from "../../lib/format";
import type { Scale, Sensor } from "../../state/dashboard";
import { buildScale, scaleStep, sensorName, type ColorScale } from "./calendarModel";
import { monthLong } from "./calendarText";

/**
 * The month level of the calendar (redesign): the days of one month, NATIVE detections of one satellite per local
 * solar day. Pure helpers only (grid, colors, words), so the component stays thin and this file is tested.
 */

export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** First month observed by VIIRS: months before it are estimated from MODIS and their days are Aqua MODIS. */
export const VIIRS_START = { year: 2012, month: 2 } as const;

export type MonthRef = { year: number; month: number };

/** One square of the month grid: a blank before the 1st or after the last day, or a day. */
export type DayCell =
  | { kind: "blank"; key: string }
  | {
      kind: "day";
      key: string;
      date: string; // YYYY-MM-DD
      day: number; // 1..31
      weekday: number; // 0 = Monday .. 6 = Sunday
      /** "observed": inside the data (count may be 0). "no_data": after the last day of data, or not in the answer. */
      status: "observed" | "no_data";
      count: number | null;
      passes: DailyPass[];
      /** The last local solar date with data in the archive. */
      isLatest: boolean;
    };

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Weekday of a date, Monday first: 0 = Monday .. 6 = Sunday. */
export function weekdayMondayFirst(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/** The month before or after (delta = -1 / +1), over the year end. */
export function shiftMonth({ year, month }: MonthRef, delta: number): MonthRef {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function compareMonths(a: MonthRef, b: MonthRef): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/** Months before February 2012 are estimated from MODIS (harmonized) and their days are native Aqua MODIS. */
export function isEstimatedEra({ year, month }: MonthRef): boolean {
  return compareMonths({ year, month }, VIIRS_START) < 0;
}

/**
 * The grid of a month, Monday first: blanks before the 1st, one cell per day, blanks to finish the last week.
 * A day after `lastDate`, or missing from the answer, is "no_data" (never zero).
 */
export function buildMonthGrid(year: number, month: number, days: readonly DailyDay[], lastDate: string | null): DayCell[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cells: DayCell[] = [];
  const lead = weekdayMondayFirst(year, month, 1);
  for (let i = 0; i < lead; i += 1) cells.push({ kind: "blank", key: `lead-${i}` });
  const total = daysInMonth(year, month);
  for (let day = 1; day <= total; day += 1) {
    const date = isoDate(year, month, day);
    const entry = byDate.get(date);
    const afterLast = lastDate !== null && date > lastDate;
    const observed = entry?.status === "observed" && !afterLast;
    cells.push({
      kind: "day",
      key: date,
      date,
      day,
      weekday: weekdayMondayFirst(year, month, day),
      status: observed ? "observed" : "no_data",
      count: observed ? (entry?.count ?? 0) : null,
      passes: observed ? (entry?.passes ?? []) : [],
      isLatest: lastDate === date,
    });
  }
  let trail = 0;
  while (cells.length % 7 !== 0) cells.push({ kind: "blank", key: `trail-${trail++}` });
  return cells;
}

export type DayItem = Extract<DayCell, { kind: "day" }>;

export function dayItems(cells: readonly DayCell[]): DayItem[] {
  return cells.filter((c): c is DayItem => c.kind === "day");
}

/** Per-month sequential scale over the observed counts (zeros set aside, like the year view). */
export function dayScale(cells: readonly DayCell[]): ColorScale | null {
  return buildScale(dayItems(cells).flatMap((c) => (c.status === "observed" && c.count !== null ? [c.count] : [])));
}

/** Fill of a day: "nodata" (hatched), "zero" (no detection) or a ramp step 1..7. */
export function dayFill(cell: DayItem, scale: ColorScale | null): "nodata" | "zero" | number {
  if (cell.status !== "observed" || cell.count === null) return "nodata";
  if (cell.count === 0 || !scale) return "zero";
  return scaleStep(cell.count, scale);
}

/** Sum of the native detections of the observed days. Null when no day is observed. */
export function nativeTotal(cells: readonly DayCell[]): number | null {
  const observed = dayItems(cells).filter((c) => c.status === "observed");
  return observed.length === 0 ? null : observed.reduce((sum, c) => sum + (c.count ?? 0), 0);
}

/** Where the arrow keys move the focus in the grid (days only): ±1 day, ±1 week, Home / End of the week. */
export function moveDay(day: number, key: string, total: number, weekday: number): number | null {
  const target =
    key === "ArrowLeft"
      ? day - 1
      : key === "ArrowRight"
        ? day + 1
        : key === "ArrowUp"
          ? day - 7
          : key === "ArrowDown"
            ? day + 7
            : key === "Home"
              ? day - weekday
              : key === "End"
                ? day + (6 - weekday)
                : null;
  if (target === null) return null;
  return Math.min(total, Math.max(1, target));
}

// ---------------------------------------------------------------------------------------------------------
// Months the arrows can reach

/** First and last month of the harmonized calendar (any period), to bound the previous / next buttons. */
export function monthBounds(months: readonly CalendarMonth[]): { first: MonthRef; last: MonthRef } | null {
  if (months.length === 0) return null;
  let first = months[0] as MonthRef;
  let last = months[0] as MonthRef;
  for (const m of months) {
    if (compareMonths(m, first) < 0) first = m;
    if (compareMonths(m, last) > 0) last = m;
  }
  return { first: { year: first.year, month: first.month }, last: { year: last.year, month: last.month } };
}

// ---------------------------------------------------------------------------------------------------------
// Words

/** The satellite a map layer asks for; the harmonized layer lets the server pick the month's source satellite. */
export function satelliteForSensor(sensor: Sensor): string | undefined {
  return { harmonized: undefined, aqua: "Aqua", terra: "Terra", snpp: "SNPP", n20: "N20" }[sensor];
}

/**
 * The satellite of the days, from the same series the "Data" filter shows (FilterBar `dataSeriesOf`): harmonized
 * (scale and map layer harmonized) lets the server pick the month's source satellite; raw + a satellite layer asks
 * for that satellite; "mixed" when the scale and the layer disagree.
 */
export function dailySatellite(state: { scale: Scale; sensor: Sensor }): { satellite: string | undefined } | "mixed" {
  if (state.sensor === "harmonized") return state.scale === "harmonized" ? { satellite: undefined } : "mixed";
  return state.scale === "raw" ? { satellite: satelliteForSensor(state.sensor) } : "mixed";
}

/** The note for a month before VIIRS, built from the satellite the answer names. */
export function estimatedEraText(satellite: string, instrument?: string): string {
  return `This month is before VIIRS (February 2012): its days are native ${satelliteText(satellite, instrument)} detections; only the month total is harmonized (estimated from MODIS).`;
}

/** "S-NPP VIIRS", "Aqua MODIS". Falls back to the satellite and instrument the API gave. */
export function satelliteText(satellite: string, instrument?: string): string {
  const known = sensorName(satellite);
  if (known !== sensorName(null)) return known;
  return [satellite, instrument].filter(Boolean).join(" ");
}

/** The label every daily number carries: one satellite, native, not harmonized. Never "fires". */
export function sourceLabel(response: Pick<DailyResponse, "satellite" | "instrument">): string {
  return `Native detections · ${satelliteText(response.satellite, response.instrument)} · not harmonized`;
}

/** "Wednesday, 3 September 2025". */
export function dayLong(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${WEEKDAYS_LONG[weekdayMondayFirst(y, m, d)]}, ${d} ${monthLong(m)} ${y}`;
}

/** "12 native detections", "1 native detection", "No detection", "No data yet". */
export function dayCountText(cell: Pick<DayItem, "status" | "count">): string {
  if (cell.status !== "observed" || cell.count === null) return "No data yet";
  if (cell.count === 0) return "No detection";
  return `${formatCount(cell.count)} native ${cell.count === 1 ? "detection" : "detections"}`;
}

/** Screen-reader label of a day, the full text the square abbreviates. */
export function dayAriaLabel(cell: DayItem, satellite: string): string {
  const parts = [`${dayLong(cell.date)}: ${dayCountText(cell)}`];
  if (cell.status === "observed") parts.push(`${satellite}, not harmonized`);
  if (cell.status === "observed" && cell.count === 0) parts.push("No detection does not mean no fire");
  if (cell.isLatest) parts.push("Latest data");
  return `${parts.join(". ")}.`;
}

/** "Day pass", "Night pass". */
export function daynightText(daynight: DailyPass["daynight"]): string {
  return daynight === "D" ? "Day pass" : "Night pass";
}

/** "13:05–13:12": one time when the pass starts and ends in the same minute. */
export function timeRange(start: string, end: string): string {
  return start === end ? start : `${start}–${end}`;
}

/** Why a request failed, in words for users. A 404 (or an HTML page) means this server has no daily endpoint yet. */
export function dailyErrorText(message: string): { missing: boolean; text: string } {
  const missing = /not found|\(404\)|unexpected token|json/i.test(message);
  return missing
    ? { missing, text: "Daily details are not available on this server yet." }
    : { missing, text: `The daily numbers could not be loaded. ${message}` };
}

/** Text of the harmonized total of a month, for the header next to the native daily numbers. */
export function harmonizedTotalText(entry: CalendarMonth | null): string {
  if (!entry || entry.count === null) return "No harmonized estimate for this month";
  return `${formatCount(entry.count)} VIIRS-equivalent hotspot detections`;
}
