import type { CalendarMonth } from "../../data/calendarSource";
import { anomalyStep } from "../../lib/charts";
import type { CalendarDatum, CalendarSerie, ColorScale } from "./calendarModel";
import { scaleStep } from "./calendarModel";

/**
 * Filters of the calendar that mask months without moving them: the grid keeps its positions, and a month that does
 * not match is drawn as "filtered out" (not as no data, and not as zero).
 */

/** Where a month stands against its historical median: the robust z-score the calendar already computes. */
export type DeviationBand = "below" | "near" | "above" | "none";
/** |z| under this is "near the reference". Same as the first limit of the anomaly legend would be too fine here. */
export const NEAR_LIMIT = 1;
export const DEVIATION_BANDS: ReadonlyArray<{ band: DeviationBand; label: string; limits: string }> = [
  { band: "below", label: "Below", limits: `z ≤ −${NEAR_LIMIT}` },
  { band: "near", label: "Near", limits: `−${NEAR_LIMIT} < z < +${NEAR_LIMIT}` },
  { band: "above", label: "Above", limits: `z ≥ +${NEAR_LIMIT}` },
  { band: "none", label: "No valid comparison", limits: "no median, partial month or too few years" },
];

export function deviationBand(entry: CalendarMonth | null): DeviationBand {
  const z = entry?.anomalyZ;
  if (z == null) return "none";
  return z <= -NEAR_LIMIT ? "below" : z >= NEAR_LIMIT ? "above" : "near";
}

/** Months counted as an index (year * 12 + month - 1), so a window is two integers. */
export const monthIndex = (year: number, month: number) => year * 12 + month - 1;

export type CalendarFilters = {
  /** Detections per month, inclusive. Null = no limit. */
  volumeMin: number | null;
  volumeMax: number | null;
  /** Bands kept. Empty = every band. */
  deviation: readonly DeviationBand[];
  /** A window of months (shortcuts such as "Latest 12 months"). Null = the whole years selected. */
  range: { from: number; to: number } | null;
  /** Color steps picked in the legend (count steps, or anomaly steps in the anomaly view). Empty = all. */
  legend: readonly number[];
};

export const NO_FILTERS: CalendarFilters = { volumeMin: null, volumeMax: null, deviation: [], range: null, legend: [] };

export function activeFilterCount(f: CalendarFilters): number {
  return (
    (f.volumeMin !== null || f.volumeMax !== null ? 1 : 0) +
    (f.deviation.length > 0 ? 1 : 0) +
    (f.range ? 1 : 0) +
    (f.legend.length > 0 ? 1 : 0)
  );
}

export type MatchContext = { scale: ColorScale | null; anomaly: boolean };

/** Whether a month with data passes every active filter. Months without data never "match": they are not filtered. */
export function passesFilters(cell: CalendarDatum, f: CalendarFilters, ctx: MatchContext): boolean {
  if (cell.entry === null) return true;
  const value = cell.y;
  if (f.range && (monthIndex(cell.year, cell.month) < f.range.from || monthIndex(cell.year, cell.month) > f.range.to))
    return false;
  if (f.volumeMin !== null || f.volumeMax !== null) {
    if (value === null) return false;
    if (f.volumeMin !== null && value < f.volumeMin) return false;
    if (f.volumeMax !== null && value > f.volumeMax) return false;
  }
  if (f.deviation.length > 0 && !f.deviation.includes(deviationBand(cell.entry))) return false;
  if (f.legend.length > 0) {
    if (value === null) return false;
    if (ctx.anomaly) {
      const z = cell.entry.anomalyZ;
      if (z == null || !f.legend.includes(anomalyStep(z))) return false;
    } else if (value === 0) {
      return false; // a zero is its own class, not a step
    } else if (!ctx.scale || !f.legend.includes(scaleStep(value, ctx.scale))) {
      return false;
    }
  }
  return true;
}

/** Months with data in the series, and how many of them pass. */
export function countMatches(series: ReadonlyArray<CalendarSerie>, f: CalendarFilters, ctx: MatchContext) {
  let total = 0;
  let matching = 0;
  for (const row of series) {
    for (const cell of row.data) {
      if (cell.entry === null) continue;
      total += 1;
      if (passesFilters(cell, f, ctx)) matching += 1;
    }
  }
  return { total, matching };
}

/** The latest month that has a row, as a month index. Null when there is none. */
export function latestMonthIndex(months: readonly CalendarMonth[]): number | null {
  let best: number | null = null;
  for (const m of months) {
    const i = monthIndex(m.year, m.month);
    if (best === null || i > best) best = i;
  }
  return best;
}

export type Shortcut = "latest12" | "latest5y" | "full";
export const SHORTCUTS: ReadonlyArray<{ id: Shortcut; label: string }> = [
  { id: "latest12", label: "Latest 12 months" },
  { id: "latest5y", label: "Latest 5 years" },
  { id: "full", label: "Full record" },
];

/** What a shortcut sets, from the last month in the data: the years to show and the window of months (if any). */
export function shortcutRange(
  id: Shortcut,
  latest: number,
  firstYear: number,
): { startYear: number; endYear: number; range: { from: number; to: number } | null } {
  const endYear = Math.floor(latest / 12);
  if (id === "latest12")
    return { startYear: Math.floor((latest - 11) / 12), endYear, range: { from: latest - 11, to: latest } };
  if (id === "latest5y") return { startYear: Math.max(firstYear, endYear - 4), endYear, range: null };
  return { startYear: firstYear, endYear, range: null };
}

/** The shortcut that the current selection equals, for the pressed state. */
export function activeShortcut(
  startYear: number,
  endYear: number,
  range: CalendarFilters["range"],
  latest: number | null,
  firstYear: number,
): Shortcut | null {
  if (latest === null) return null;
  for (const { id } of SHORTCUTS) {
    const s = shortcutRange(id, latest, firstYear);
    const sameRange =
      (s.range?.from ?? null) === (range?.from ?? null) && (s.range?.to ?? null) === (range?.to ?? null);
    if (s.startYear === startYear && s.endYear === endYear && sameRange) return id;
  }
  return null;
}
