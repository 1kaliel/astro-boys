import type { CalendarMonth } from "../data/calendarSource";

// ---------------------------------------------------------------------------------------------------------
// Trend: one value per year

/** Totals of one year. A series is null unless all twelve months are complete and have a value. */
export type AnnualTotals = {
  year: number;
  /** VIIRS-equivalent hotspots of the year (the harmonized series). */
  harmonized: number | null;
  /** Months of the year that are estimated from MODIS (0 = the whole year was observed by VIIRS). */
  estimatedMonths: number;
  /** Native Aqua MODIS count of the year, not harmonized. */
  rawAqua: number | null;
  /** Native S-NPP VIIRS count of the year, not harmonized. */
  rawSnpp: number | null;
};

function yearSum(months: readonly CalendarMonth[], pick: (m: CalendarMonth) => number | null | undefined): number | null {
  // An incomplete year is not a low year: twelve complete months with a value, or nothing.
  if (months.length !== 12 || months.some((m) => m.isPartial)) return null;
  let total = 0;
  for (const m of months) {
    const value = pick(m);
    if (value == null) return null;
    total += value;
  }
  return total;
}

/**
 * Yearly totals for the trend chart: the harmonized series next to the raw counts of each sensor. Raw counts
 * of different satellites are never added together (MODIS and VIIRS are different instruments).
 */
export function annualTotals(months: readonly CalendarMonth[]): AnnualTotals[] {
  const byYear = new Map<number, CalendarMonth[]>();
  for (const m of months) byYear.set(m.year, [...(byYear.get(m.year) ?? []), m]);
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, rows]) => ({
      year,
      harmonized: yearSum(rows, (m) => m.count),
      estimatedMonths: rows.filter((m) => m.isEstimated).length,
      rawAqua: yearSum(rows, (m) => m.raw?.aqua),
      rawSnpp: yearSum(rows, (m) => m.raw?.snpp),
    }));
}

// ---------------------------------------------------------------------------------------------------------
// Seasonal profile: the typical year, month by month

/** Quantile of ascending values, with linear interpolation between neighbours. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export type SeasonalMonth = {
  month: number; // 1..12
  /** Number of years behind the band. */
  years: number;
  p10: number | null;
  median: number | null;
  p90: number | null;
};

/** Fewer years than this give no band: three numbers are not a distribution. */
export const MIN_PROFILE_YEARS = 5;

/**
 * The typical year of the area: for each month of the year, the median and the 10th to 90th percentile band of
 * the complete months with a value in the years shown. Partial months are left out (never read as low activity).
 */
export function seasonalProfile(
  months: readonly CalendarMonth[],
  startYear: number,
  endYear: number,
): SeasonalMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const values = months
      .filter((m) => m.month === month && m.year >= startYear && m.year <= endYear && !m.isPartial && m.count != null)
      .map((m) => m.count as number)
      .sort((a, b) => a - b);
    if (values.length < MIN_PROFILE_YEARS) return { month, years: values.length, p10: null, median: null, p90: null };
    return {
      month,
      years: values.length,
      p10: quantile(values, 0.1),
      median: quantile(values, 0.5),
      p90: quantile(values, 0.9),
    };
  });
}

/** The twelve months of one year, in order; null where the year has no row for that month. */
export function monthsOfYear(months: readonly CalendarMonth[], year: number): Array<CalendarMonth | null> {
  return Array.from({ length: 12 }, (_, index) => months.find((m) => m.year === year && m.month === index + 1) ?? null);
}

// ---------------------------------------------------------------------------------------------------------
// Anomaly mode: steps of the diverging ramp

/** Largest step of each arm of the diverging ramp (`--viz-div-neg-4` .. `--viz-div-pos-4`). */
export const DIVERGING_STEPS = 4;
/** Robust z-score where each step starts: |z| below the first limit is "about the median". */
export const ANOMALY_LIMITS = [0.5, 1, 2, 3] as const;

/**
 * Step of the diverging ramp for a robust z-score: 0 is about the median, -4..-1 below it, 1..4 above it.
 * The z-score says how unusual a month is for that month of the year; it is not a probability of fire.
 */
export function anomalyStep(z: number): number {
  const size = ANOMALY_LIMITS.filter((limit) => Math.abs(z) >= limit).length;
  if (size === 0) return 0;
  return z < 0 ? -size : size;
}

/** CSS color of a step of the diverging ramp. */
export function anomalyColor(step: number): string {
  if (step === 0) return "var(--viz-div-mid)";
  const arm = step < 0 ? "neg" : "pos";
  return `var(--viz-div-${arm}-${Math.min(DIVERGING_STEPS, Math.abs(step))})`;
}

/** The nine classes of the anomaly legend, from far below to far above the median. */
export function anomalyLegend(): Array<{ step: number; label: string }> {
  const label = (step: number): string => {
    if (step === 0) return `±${ANOMALY_LIMITS[0]}`;
    const size = Math.abs(step);
    const from = ANOMALY_LIMITS[size - 1];
    const sign = step < 0 ? "−" : "+";
    return size === DIVERGING_STEPS ? `${sign}${from} or more` : `${sign}${from} to ${sign}${ANOMALY_LIMITS[size]}`;
  };
  const steps = Array.from({ length: DIVERGING_STEPS * 2 + 1 }, (_, i) => i - DIVERGING_STEPS);
  return steps.map((step) => ({ step, label: label(step) }));
}

// ---------------------------------------------------------------------------------------------------------
// Axes

/**
 * A round number at or above `value`, for the top of a count axis. The steps are close enough that the axis is
 * never much taller than the data, and each divides into four round ticks (1.2M gives 300K, 600K, 900K).
 */
export function niceCeil(value: number): number {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const fraction = value / power;
  const nice = [1, 1.2, 1.6, 2, 2.4, 3.2, 4, 6, 8, 10].find((step) => fraction <= step) ?? 10;
  return nice * power;
}

/** `count + 1` evenly spaced ticks from 0 to `max`. */
export function axisTicks(max: number, count: number = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max * i) / count);
}
