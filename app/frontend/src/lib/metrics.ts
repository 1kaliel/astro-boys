import type { CalendarMonth } from "../data/calendarSource";

export function inYears(months: readonly CalendarMonth[], start: number, end: number): CalendarMonth[] {
  return months.filter((m) => m.year >= start && m.year <= end);
}

/** Percent change, or null when the base is not positive (undefined percentage). */
export function percentChange(value: number, base: number | null): number | null {
  return base != null && base > 0 ? (100 * (value - base)) / base : null;
}

/** Month of the year with the highest historical median (the median is the same for every year of a month). */
export function busiestMonth(months: readonly CalendarMonth[]): { month: number; median: number } | null {
  const medians = new Map<number, number>();
  for (const m of months) {
    if (!m.isPartial && m.medianHist != null) medians.set(m.month, m.medianHist);
  }
  let best: { month: number; median: number } | null = null;
  for (const [month, median] of medians) {
    if (!best || median > best.median) best = { month, median };
  }
  return best;
}

/**
 * The complete months of the latest year against the sum of their monthly medians. Partial months are left out
 * (`partial` says one was): an incomplete month next to a full-month median would read as "little activity".
 * Null when there is no complete month, or a count or a median is missing.
 */
export function yearToDate(
  months: readonly CalendarMonth[],
): { year: number; value: number; median: number; months: number; partial: boolean } | null {
  const last = months.at(-1);
  if (!last) return null;
  const all = months.filter((m) => m.year === last.year);
  const rows = all.filter((m) => !m.isPartial);
  if (rows.length === 0 || rows.some((m) => m.count == null || m.medianHist == null)) return null;
  return {
    year: last.year,
    value: rows.reduce((sum, m) => sum + (m.count ?? 0), 0),
    median: rows.reduce((sum, m) => sum + (m.medianHist ?? 0), 0),
    months: rows.length,
    partial: rows.length < all.length,
  };
}

/**
 * How the latest month is compared with history, for the headline figure.
 *  - a complete month against the median of that month in earlier years;
 *  - an unfinished month against the median of the SAME DAYS of earlier years (like for like), when the API has it;
 *  - otherwise nothing: an unfinished month is never set against full months, it would read as "little activity".
 */
export type LatestComparison =
  | { kind: "month"; base: number | null }
  | { kind: "same_days"; base: number; days: number; years: number }
  | { kind: "none" };

export function latestComparison(latest: CalendarMonth): LatestComparison {
  if (!latest.isPartial) return { kind: "month", base: latest.medianHist };
  if (latest.comparison === "same_days" && latest.medianHist != null && latest.comparisonDays != null) {
    return { kind: "same_days", base: latest.medianHist, days: latest.comparisonDays, years: latest.comparisonYears ?? 0 };
  }
  return { kind: "none" };
}

export function estimatedShare(months: readonly CalendarMonth[]): { estimated: number; total: number } {
  return { estimated: months.filter((m) => m.isEstimated).length, total: months.length };
}
