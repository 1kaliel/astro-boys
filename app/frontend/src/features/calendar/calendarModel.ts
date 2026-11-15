import type { CalendarMonth } from "../../data/calendarSource";
import { MONTHS_LONG, MONTHS_SHORT, formatCount } from "../../lib/format";
import type { Period } from "../../state/dashboard";

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

/** One row of the calendar: a year with its 12 months. */
export type CalendarSerie = {
  id: string; // the year, as text
  data: CalendarDatum[];
};

/** Years x 12 months for the selected period. A month with no row becomes a "no data" cell. */
export function buildSeries(
  months: ReadonlyArray<CalendarMonth>,
  period: Period,
  startYear: number,
  endYear: number,
): CalendarSerie[] {
  const byKey = new Map<string, CalendarMonth>();
  for (const entry of months) {
    if (entry.period === period) byKey.set(`${entry.year}-${entry.month}`, entry);
  }
  const series: CalendarSerie[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const data = MONTHS_SHORT.map((label, index): CalendarDatum => {
      const month = index + 1;
      const entry = byKey.get(`${year}-${month}`) ?? null;
      return { x: label, y: entry ? entry.count : null, year, month, entry };
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

/**
 * Step of the sequential ramp (1 = least activity, `bins` = most) for a value, in equal-width bins between the
 * shown minimum and maximum. If every value is equal there is no spread, so the middle step is used.
 */
export function binIndex(value: number, min: number, max: number, bins: number = SEQ_BINS): number {
  if (max <= min) return Math.ceil(bins / 2);
  const ratio = (value - min) / (max - min);
  return Math.min(bins, Math.max(1, Math.floor(ratio * bins) + 1));
}

/** Provenance, in words. Color and outline are never the only signal. */
export function provenanceText(entry: CalendarMonth): string {
  const parts = [entry.isEstimated ? "Estimated from MODIS" : "Observed by VIIRS"];
  if (entry.isPartial) parts.push(`Partial month (${entry.daysObserved} days observed)`);
  return parts.join(". ");
}

/** Screen-reader label for one cell. */
export function cellAriaLabel(cell: CalendarDatum): string {
  const when = `${MONTHS_LONG[cell.month - 1]} ${cell.year}`;
  if (!cell.entry) return `${when}: no data`;
  return `${when}: ${formatCount(cell.entry.count)} hotspot detections. ${provenanceText(cell.entry)}`;
}
