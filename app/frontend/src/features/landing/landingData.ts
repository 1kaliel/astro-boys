/**
 * Pure helpers for the landing page: which month the globe shows, the three hero figures and the yearly totals of
 * the 2012 story. Everything is computed from the calendar of the whole study area; nothing is hard-coded.
 */
import type { CalendarMonth } from "../../data/calendarSource";
import { aboveUsual, peakMonth, totalActivity } from "../../lib/metrics";
import { MONTHS_LONG } from "../../lib/format";

/** VIIRS S-NPP replaces MODIS Aqua as the source of the record in February 2012. */
export const SENSOR_CHANGE_YEAR = 2012;

export type YearMonth = { year: number; month: number };

export function monthLabel(m: YearMonth): string {
  return `${MONTHS_LONG[m.month - 1]} ${m.year}`;
}

function isCompleteYear(rows: readonly CalendarMonth[]): boolean {
  return rows.length === 12 && rows.every((m) => !m.isPartial && m.count != null);
}

function byYear(months: readonly CalendarMonth[]): Map<number, CalendarMonth[]> {
  const years = new Map<number, CalendarMonth[]>();
  for (const m of months) years.set(m.year, [...(years.get(m.year) ?? []), m]);
  return years;
}

/** The latest year with twelve complete months (the latest complete fire season), or null. */
export function lastCompleteYear(months: readonly CalendarMonth[]): number | null {
  let best: number | null = null;
  for (const [year, rows] of byYear(months)) {
    if (isCompleteYear(rows) && (best == null || year > best)) best = year;
  }
  return best;
}

/**
 * The month the globe shows: the busiest month of the latest complete year. Falls back to the record's peak complete
 * month, then to null (the globe is drawn without cells).
 */
export function heroMonth(months: readonly CalendarMonth[]): YearMonth | null {
  const year = lastCompleteYear(months);
  const pool = months.filter((m) => !m.isPartial && m.count != null && (year == null || m.year === year));
  let best: CalendarMonth | null = null;
  for (const m of pool) if (!best || (m.count ?? 0) > (best.count ?? 0)) best = m;
  return best ? { year: best.year, month: best.month } : null;
}

export type RecordFigures = {
  firstYear: number;
  lastYear: number;
  total: number;
  peak: (YearMonth & { count: number; estimated: boolean }) | null;
  above: number;
  judged: number;
};

/** The three hero figures over the whole record: total, peak month, complete months above their usual level. */
export function recordFigures(months: readonly CalendarMonth[], firstYear: number, lastYear: number): RecordFigures | null {
  const total = totalActivity(months, firstYear, lastYear);
  if (!total) return null;
  const peak = peakMonth(months, firstYear, lastYear);
  const usual = aboveUsual(months, firstYear, lastYear);
  return {
    firstYear,
    lastYear,
    total: total.value,
    peak:
      peak && peak.count != null
        ? { year: peak.year, month: peak.month, count: peak.count, estimated: peak.isEstimated }
        : null,
    above: usual.above,
    judged: usual.judged,
  };
}

/** One complete year: the raw count of the month's source satellite, summed, next to the harmonized total. */
export type YearTotals = { year: number; raw: number; harmonized: number };

/**
 * Yearly totals of complete years. `raw` is what the archive says when read as one record (Aqua MODIS before the
 * sensor change, S-NPP VIIRS after); `harmonized` is the VIIRS-equivalent series. A year with a missing value is left
 * out rather than read as low.
 */
export function yearlyTotals(months: readonly CalendarMonth[]): YearTotals[] {
  const rows: YearTotals[] = [];
  for (const [year, list] of byYear(months)) {
    if (!isCompleteYear(list) || list.some((m) => m.rawSource == null)) continue;
    rows.push({
      year,
      raw: list.reduce((sum, m) => sum + (m.rawSource ?? 0), 0),
      harmonized: list.reduce((sum, m) => sum + (m.count ?? 0), 0),
    });
  }
  return rows.sort((a, b) => a.year - b.year);
}

export type SensorJump = { before: YearTotals; after: YearTotals; rawRatio: number; harmonizedRatio: number };

/** The step at the sensor change: the year before it against its first year. Null when either year is missing. */
export function sensorJump(rows: readonly YearTotals[], year: number = SENSOR_CHANGE_YEAR): SensorJump | null {
  const before = rows.find((r) => r.year === year - 1);
  const after = rows.find((r) => r.year === year);
  if (!before || !after || before.raw <= 0 || before.harmonized <= 0) return null;
  return { before, after, rawRatio: after.raw / before.raw, harmonizedRatio: after.harmonized / before.harmonized };
}

const FOLD = ["", "", "twofold", "threefold", "fourfold", "fivefold", "sixfold", "sevenfold", "eightfold", "ninefold", "tenfold"];

/** 9.3 -> "ninefold"; outside 2..10, "12×". Rounds down, so the word never overstates the jump. */
export function foldWord(ratio: number): string {
  const n = Math.floor(ratio);
  return FOLD[n] ? FOLD[n] : `${Math.round(ratio)}×`;
}

/** Width at which the hero text sits beside the globe instead of under it. */
export const WIDE_HERO_PX = 900;

export type GlobeFraming = {
  zoom: number;
  padding: { top: number; bottom: number; left: number; right: number };
  /** Diameter of the globe on screen, px. */
  diameter: number;
};

/** MapLibre tiles are 512 px: the globe is (512 * 2^zoom) / pi px across. */
function zoomForDiameter(px: number): number {
  return Math.log2((px * Math.PI) / 512);
}

/**
 * Where the globe sits in the hero. The camera centre is the study area, so it is centred in the globe's visible
 * face. Wide screens: the text takes the left 40%, the globe fills the right 60% at about 90% of the hero height.
 * Narrow screens: a smaller globe above the text, which takes the bottom.
 */
export function globeFraming(width: number, height: number, header: number = 64): GlobeFraming {
  const wide = width >= WIDE_HERO_PX;
  const padding = wide
    ? { top: header, bottom: 0, left: Math.round(width * 0.4), right: 0 }
    : { top: header, bottom: Math.round(height * 0.38), left: 0, right: 0 };
  const diameter = wide
    ? Math.min(0.9 * height, 0.95 * (width - padding.left))
    : Math.min(0.98 * width, 0.6 * height);
  const zoom = Math.min(3.4, Math.max(0.6, zoomForDiameter(Math.max(1, diameter))));
  return { zoom, padding, diameter };
}

/** A slow drift around the study area: degrees of longitude away from it at `ms` after the drift starts. */
export function driftOffset(ms: number, amplitude = 6, periodMs = 120_000): number {
  return amplitude * Math.sin((2 * Math.PI * ms) / periodMs);
}

// ---------------------------------------------------------------------------------------------------------
// The Brazil-wide preview: an experimental run of the same method over all of Brazil, one month, as a static file.

/** The one place the preview file is named (served from public/landing/). */
export const BRAZIL_PREVIEW_URL = "/landing/brazil-2024-09.json";

/** What the globe and the "First look" section show at the scale of Brazil. */
export const BRAZIL_BOUNDS = { west: -74, south: -34, east: -34.7, north: 5.3 } as const;

export type BrazilPreview = {
  experimental: boolean;
  note: string;
  region: string;
  year: number;
  month: number;
  modelVersion: string;
  cellsTotal: number;
  /** "2002-07" style months of the record. */
  firstMonth: YearMonth;
  lastMonth: YearMonth;
  devValidation: { years: string; mae: number; bestBaselineMae: number };
  yearlyTotals: { year: number; total: number }[];
  breaks: number[];
  cells: { id: string; value: number; estimated: boolean; partial: boolean }[];
};

function yearMonthOf(text: unknown): YearMonth {
  const match = typeof text === "string" ? /^(\d{4})-(\d{2})$/.exec(text) : null;
  if (!match) throw new Error(`Unexpected month "${String(text)}" in the Brazil preview.`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Reads the preview file. Throws if it is not the shape the landing expects (the caller falls back to the pilot). */
export function parseBrazilPreview(doc: unknown): BrazilPreview {
  const d = doc as Record<string, unknown> | null;
  const dev = d?.dev_validation as Record<string, unknown> | undefined;
  if (
    !d ||
    !Array.isArray(d.cells) ||
    !Array.isArray(d.breaks) ||
    !Array.isArray(d.yearly_totals) ||
    !isNumber(d.year) ||
    !isNumber(d.month) ||
    !dev ||
    !isNumber(dev.mae) ||
    !isNumber(dev.best_baseline_mae)
  ) {
    throw new Error("The Brazil preview has an unexpected format.");
  }
  const breaks = (d.breaks as unknown[]).filter(isNumber);
  return {
    experimental: d.experimental !== false,
    note: typeof d.note === "string" ? d.note : "",
    region: typeof d.region === "string" ? d.region : "Brazil",
    year: d.year,
    month: d.month,
    modelVersion: typeof d.model_version === "string" ? d.model_version : "",
    cellsTotal: isNumber(d.cells_total) ? d.cells_total : (d.cells as unknown[]).length,
    firstMonth: yearMonthOf(d.first_month),
    lastMonth: yearMonthOf(d.last_month),
    devValidation: { years: String(dev.years ?? ""), mae: dev.mae, bestBaselineMae: dev.best_baseline_mae },
    yearlyTotals: (d.yearly_totals as unknown[])
      .filter((row): row is [number, number] => Array.isArray(row) && isNumber(row[0]) && isNumber(row[1]))
      .map(([year, total]) => ({ year, total })),
    breaks,
    cells: (d.cells as unknown[])
      .filter((row): row is [string, number] => Array.isArray(row) && typeof row[0] === "string" && isNumber(row[1]))
      .map(([id, value]) => ({ id, value, estimated: false, partial: false })),
  };
}

/** Per-cell error against the best simple conversion, as a whole percent lower (positive = better). */
export function errorReductionPct(mae: number, baseline: number): number | null {
  return baseline > 0 ? Math.round(100 * (1 - mae / baseline)) : null;
}

/** "2020-2021" -> "2020–2021". */
export function yearSpan(text: string): string {
  return text.replace(/(\d{4})\s*-\s*(\d{4})/, "$1–$2");
}
