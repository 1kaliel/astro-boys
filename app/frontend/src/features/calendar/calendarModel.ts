import type { CalendarMonth } from "../../data/calendarSource";
import { formatCompact, formatCount, formatLegendCount } from "../../lib/format";
import type { Period } from "../../state/dashboard";
import { monthLong, monthShort } from "./calendarText";

/** Number of steps in the sequential ramp (`--viz-seq-1` .. `--viz-seq-7`). */
export const SEQ_BINS = 7;

/** One cell of the calendar. `y` is the heatmap value; null means "no data", never zero. */
export type CalendarDatum = {
  x: string; // month label, e.g. "Mar"
  y: number | null;
  year: number;
  month: number; // 1..12
  entry: CalendarMonth | null;
};

/** One row of the calendar: a year with its months. */
export type CalendarSerie = {
  id: string; // the year, as text
  data: CalendarDatum[];
};

const ALL_MONTHS: readonly number[] = Array.from({ length: 12 }, (_, index) => index + 1);

/**
 * Years x months for the selected period. A month with no row becomes a "no data" cell.
 * `selectedMonths` keeps only those months of the year (empty = all twelve).
 */
export function buildSeries(
  months: ReadonlyArray<CalendarMonth>,
  period: Period,
  startYear: number,
  endYear: number,
  selectedMonths: readonly number[] = [],
): CalendarSerie[] {
  const byKey = new Map<string, CalendarMonth>();
  for (const entry of months) {
    if (entry.period === period) byKey.set(`${entry.year}-${entry.month}`, entry);
  }
  const shown = selectedMonths.length === 0 ? ALL_MONTHS : ALL_MONTHS.filter((m) => selectedMonths.includes(m));
  const series: CalendarSerie[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const data = shown.map((month): CalendarDatum => {
      const entry = byKey.get(`${year}-${month}`) ?? null;
      return { x: monthShort(month), y: entry ? entry.count : null, year, month, entry };
    });
    series.push({ id: String(year), data });
  }
  return series;
}

/** Smallest and largest value shown, ignoring "no data" cells. Null when nothing has data. */
export function valueRange(series: ReadonlyArray<CalendarSerie>): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const row of series) {
    for (const cell of row.data) {
      if (cell.y === null) continue;
      if (cell.y < min) min = cell.y;
      if (cell.y > max) max = cell.y;
    }
  }
  return min === Infinity ? null : { min, max };
}

// ---------------------------------------------------------------------------------------------------------
// Color scale

/**
 * Where each color starts. Hotspot counts are very skewed (a few peak months are many times the typical month),
 * so equal-width steps would paint most months in the palest colors. The steps are quantiles instead: each color
 * holds about the same number of months. The legend prints the limits, so the scale is never hidden.
 *
 * A valid zero is not a color step: it is its own class (drawn with a "0"), so a month with no detections is never
 * confused with a small positive count, and never with a month that has no data.
 */
export type ColorScale = {
  /** Lower limit of every color but the first, ascending and unique. `breaks.length + 1` colors are in use. */
  breaks: number[];
  /** Smallest and largest positive value. Both 0 when the values shown are all zero. */
  min: number;
  max: number;
};

/** The scale of the values shown (zeros set aside). Null when there is nothing to scale. */
export function buildScale(values: ReadonlyArray<number>, steps: number = SEQ_BINS): ColorScale | null {
  if (values.length === 0) return null;
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return { breaks: [], min: 0, max: 0 };
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const breaks: number[] = [];
  for (let i = 1; i < steps; i += 1) {
    const limit = sorted[Math.floor((sorted.length * i) / steps)];
    // A limit equal to the minimum or to the previous one would make an empty color: skip it.
    if (limit > min && (breaks.length === 0 || limit > breaks[breaks.length - 1])) breaks.push(limit);
  }
  return { breaks, min, max };
}

/** Step of the sequential ramp (1 = least, `steps` = most) for a positive value. With few colors in use they are
 * spread over the ramp, so the contrast does not shrink. */
export function scaleStep(value: number, scale: ColorScale, steps: number = SEQ_BINS): number {
  const colors = scale.breaks.length + 1;
  if (colors === 1) return Math.ceil(steps / 2); // no spread at all: the middle color
  const bin = scale.breaks.filter((limit) => value >= limit).length; // 0 .. colors - 1
  return Math.round(1 + (bin * (steps - 1)) / (colors - 1));
}

/** What a legend segment covers: from `from` up to (not including) `to`; the last one runs to the maximum. */
export type LegendRange = { step: number; from: number; to: number; includesTo: boolean; label: string };

/** The colors in use with the range of detections each covers, for the legend ("1.4K–4.4K"). Empty when there is
 * no positive value. */
export function legendRanges(scale: ColorScale, steps: number = SEQ_BINS): LegendRange[] {
  if (scale.max === 0) return [];
  const lowers = [scale.min, ...scale.breaks];
  return lowers.map((from, bin) => {
    const last = bin === lowers.length - 1;
    const to = last ? scale.max : lowers[bin + 1];
    const label = from === to ? formatLegendCount(from) : `${formatLegendCount(from)}–${formatLegendCount(to)}`;
    return { step: scaleStep(from, scale, steps), from, to, includesTo: last, label };
  });
}

// ---------------------------------------------------------------------------------------------------------
// Peak season

/**
 * The three consecutive months (wrapping over the year end) with the highest typical activity, from the median
 * over the years shown. Partial months are left out of the median: they would read as "little activity".
 * Null when fewer than three months of the year have data.
 */
export function peakSeason(series: ReadonlyArray<CalendarSerie>): readonly [number, number, number] | null {
  const byMonth = new Map<number, number[]>();
  for (const row of series) {
    for (const cell of row.data) {
      if (cell.y === null || cell.entry?.isPartial) continue;
      byMonth.set(cell.month, [...(byMonth.get(cell.month) ?? []), cell.y]);
    }
  }
  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const typical = new Map<number, number>();
  for (const [month, values] of byMonth) typical.set(month, median(values));

  let best: readonly [number, number, number] | null = null;
  let bestTotal = -Infinity;
  for (let start = 1; start <= 12; start += 1) {
    const trio = [start, ((start) % 12) + 1, ((start + 1) % 12) + 1] as const;
    if (!trio.every((m) => typical.has(m))) continue;
    const total = trio.reduce((sum, m) => sum + (typical.get(m) ?? 0), 0);
    if (total > bestTotal) {
      bestTotal = total;
      best = trio;
    }
  }
  return best;
}

/** "Sep–Nov" for consecutive months, "Nov–Jan" over the year end, "Jan, Mar" when they are not consecutive. */
export function monthSpan(months: readonly number[]): string {
  if (months.length === 0) return "";
  const sorted = [...months].sort((a, b) => a - b);
  // The start of a run is a month whose predecessor (in the circle of the year) is not selected.
  const start = sorted.find((m) => !sorted.includes(((m + 10) % 12) + 1)) ?? sorted[0];
  const distance = (m: number) => (m - start + 12) % 12;
  const ordered = [...sorted].sort((a, b) => distance(a) - distance(b));
  const names = ordered.map((m) => monthShort(m));
  if (names.length === 1) return names[0];
  const consecutive = ordered.every((m, i) => i === 0 || (m - ordered[i - 1] + 12) % 12 === 1);
  return consecutive ? `${names[0]}–${names[names.length - 1]}` : names.join(", ");
}

// ---------------------------------------------------------------------------------------------------------
// Words

const SENSOR_NAMES: Record<string, string> = {
  Aqua: "Aqua MODIS",
  Terra: "Terra MODIS",
  SNPP: "S-NPP VIIRS",
  N20: "NOAA-20 VIIRS",
};

/** "Aqua MODIS", "S-NPP VIIRS": the satellite and instrument a month comes from. */
export function sensorName(sourceSatellite: string | null | undefined): string {
  return (sourceSatellite && SENSOR_NAMES[sourceSatellite]) || "the source satellite";
}

/**
 * How a month compares with its median, in words: "25% above the September median (120K), robust z +1.3".
 * The z-score says how unusual the month is for that month of the year; it is not a probability of fire.
 * Null when the month has no comparison (no median, or a partial month without same-days history).
 */
export function anomalyText(entry: CalendarMonth): string | null {
  if (entry.medianHist == null || entry.anomalyAbs == null) return null;
  const against =
    entry.comparison === "same_days" && entry.comparisonDays != null
      ? `the median of the same ${entry.comparisonDays} days`
      : `the ${monthLong(entry.month)} median`;
  const size =
    entry.anomalyPct != null ? `${formatCount(Math.abs(entry.anomalyPct))}%` : formatCount(Math.abs(entry.anomalyAbs));
  const direction = entry.anomalyAbs === 0 ? "Equal to" : `${size} ${entry.anomalyAbs > 0 ? "above" : "below"}`;
  const z = entry.anomalyZ != null ? `, robust z ${entry.anomalyZ > 0 ? "+" : ""}${entry.anomalyZ.toFixed(1)}` : "";
  return `${direction} ${against} (${formatCompact(entry.medianHist)})${z}`;
}

/** Provenance, in words. Color and outline are never the only signal. */
export function provenanceText(entry: CalendarMonth): string {
  const parts = [
    entry.rawView
      ? `Native count of ${sensorName(entry.sourceSatellite)}, not harmonized`
      : entry.isEstimated
        ? "Estimated from MODIS"
        : "Observed by VIIRS",
  ];
  if (entry.isPartial) parts.push(`Partial month (${entry.daysObserved} days observed)`);
  return parts.join(". ");
}

/** Screen-reader label for one cell. */
export function cellAriaLabel(cell: CalendarDatum): string {
  const when = `${monthLong(cell.month)} ${cell.year}`;
  if (!cell.entry) return `${when}: no data`;
  if (cell.entry.count === null) return `${when}: no estimate. ${provenanceText(cell.entry)}`;
  return `${when}: ${formatCount(cell.entry.count)} hotspot detections. ${provenanceText(cell.entry)}`;
}
