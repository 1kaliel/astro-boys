import type { CalendarMonth } from "../data/calendarSource";
import { formatCompact, formatCount, MONTHS_LONG } from "./format";

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

/**
 * Delta in ink, in words: "▼ 60% below the March median (100)". More or fewer hotspots is not "good" or "bad",
 * and nothing here is a risk. The arrow carries the direction, so the size is shown without a sign.
 */
export function deltaText(value: number, base: number | null, against: string): string {
  if (base == null) return "No comparison available";
  const change = value - base;
  const pct = percentChange(value, base);
  const size = pct != null ? `${formatCount(Math.abs(pct))}%` : formatCount(Math.abs(change));
  if (change === 0) return `Equal to ${against} (${formatCompact(base)})`;
  const [arrow, word] = change > 0 ? ["▲", "above"] : ["▼", "below"];
  return `${arrow} ${size} ${word} ${against} (${formatCompact(base)})`;
}

/**
 * The two lines under the hero figure: what it counts and over which days (detail), then how it compares
 * (comparison, absent when there is nothing to compare).
 */
export function latestKpiText(latest: CalendarMonth | null): { detail: string; comparison?: string } {
  if (!latest) return { detail: "No data" };
  const monthName = MONTHS_LONG[latest.month - 1];
  const days = latest.isPartial ? `${monthName} 1–${latest.daysObserved}, ${latest.year}` : `${monthName} ${latest.year}`;
  if (latest.count == null) return { detail: `VIIRS-equivalent hotspots · ${days} · no estimate for this month` };
  const detail = `VIIRS-equivalent hotspots · ${days}`;
  const comparison = latestComparison(latest);
  if (comparison.kind === "same_days") {
    // Like for like: days 1..d of this month against days 1..d of earlier years.
    const against = `the median of the same ${comparison.days} days`;
    return { detail, comparison: `${deltaText(latest.count, comparison.base, against)}, ${comparison.years} earlier years` };
  }
  if (comparison.kind === "none") {
    // A partial month is never compared with full months: it would read as "little activity".
    return { detail, comparison: `Partial month, not compared with the ${monthName} median` };
  }
  return { detail, comparison: deltaText(latest.count, comparison.base, `the ${monthName} median`) };
}

export function estimatedShare(months: readonly CalendarMonth[]): { estimated: number; total: number } {
  return { estimated: months.filter((m) => m.isEstimated).length, total: months.length };
}
