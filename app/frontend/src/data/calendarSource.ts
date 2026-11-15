import type { Bounds, Period } from "../state/dashboard";

/**
 * One month of the harmonized calendar, summed over the selected area.
 * Mirrors the `calendar/v1` columns the calendar needs (docs/data-dictionary.md section 1).
 */
export type CalendarMonth = {
  year: number;
  month: number; // 1..12
  period: Period;
  /** VIIRS-equivalent hotspot detections (never "fires"). */
  count: number;
  /** 90% interval. Null = not delivered yet for an estimated month (never zero). Equal to `count` when observed. */
  ciLow: number | null;
  ciHigh: number | null;
  /** Estimated from MODIS (before 2012-02), as opposed to observed by VIIRS. */
  isEstimated: boolean;
  /** The month is not complete yet (or a satellite gap): never read it as "little activity". */
  isPartial: boolean;
  daysObserved: number;
  /** Historical median and anomalies of the area sum, per month of the year. Null when not available. */
  medianHist: number | null;
  anomalyAbs: number | null;
  anomalyPct: number | null;
  anomalyZ: number | null;
  /**
   * What `medianHist` is the median of: the same month in earlier years ("month", complete months), or the SAME DAYS
   * of an unfinished month in earlier years ("same_days": like for like). Null when there is no median.
   */
  comparison: "month" | "same_days" | null;
  /** For "same_days": days 1..comparisonDays of the month, and how many earlier years the median is over. */
  comparisonDays: number | null;
  comparisonYears: number | null;
};

export type CalendarDataset = {
  /** True while the data is the mock: synthetic numbers, for building screens only. */
  synthetic: boolean;
  modelVersion: string;
  note: string;
  /** The period every month belongs to (API data), or null when the dataset holds all periods (the fixture). */
  period: Period | null;
  /** Number of 0.25 degree cells in the area, when known. */
  cells: number | null;
  /** Years the median is computed over. Null when there is no complete month. */
  baselineYears: readonly [number, number] | null;
  firstYear: number;
  lastYear: number;
  months: CalendarMonth[];
};

export type CalendarRequest = { area: Bounds; period: Period };

// ---------------------------------------------------------------------------------------------------------
// The backend (task D2): GET /api/calendar

type ApiMonth = {
  year: number;
  month: number;
  count_harmonized: number;
  ci_low: number | null;
  ci_high: number | null;
  is_estimated: boolean;
  is_partial: boolean;
  days_observed: number;
  median_hist: number | null;
  anomaly_abs: number | null;
  anomaly_pct: number | null;
  anomaly_z: number | null;
  comparison?: string | null;
  comparison_days?: number | null;
  comparison_years?: number | null;
};

export type ApiCalendar = {
  area: { cells: number };
  period: Period;
  model_version: string;
  baseline_years: readonly [number, number] | null;
  first_year: number;
  last_year: number;
  months: ApiMonth[];
};

/** Turn the API answer into typed months. Throws if the answer is not the shape this app expects. */
export function parseApiResponse(doc: ApiCalendar): CalendarDataset {
  if (!doc || !Array.isArray(doc.months) || typeof doc.model_version !== "string") {
    throw new Error("The calendar API answered with an unexpected format.");
  }
  return {
    synthetic: false,
    modelVersion: doc.model_version,
    note: "",
    period: doc.period,
    cells: doc.area?.cells ?? null,
    baselineYears: doc.baseline_years ?? null,
    firstYear: doc.first_year,
    lastYear: doc.last_year,
    months: doc.months.map(
      (m): CalendarMonth => ({
        year: m.year,
        month: m.month,
        period: doc.period,
        count: m.count_harmonized,
        ciLow: m.ci_low,
        ciHigh: m.ci_high,
        isEstimated: m.is_estimated,
        isPartial: m.is_partial,
        daysObserved: m.days_observed,
        medianHist: m.median_hist,
        anomalyAbs: m.anomaly_abs,
        anomalyPct: m.anomaly_pct,
        anomalyZ: m.anomaly_z,
        comparison: m.comparison === "same_days" || m.comparison === "month" ? m.comparison : null,
        comparisonDays: m.comparison_days ?? null,
        comparisonYears: m.comparison_years ?? null,
      }),
    ),
  };
}

/** The message to show when the API answers with an error (FastAPI puts it in `detail`). */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  } catch {
    // The body was not JSON: fall through to the generic message.
  }
  return `The calendar API answered ${response.status}.`;
}

// ---------------------------------------------------------------------------------------------------------
// The fixture: SYNTHETIC numbers from the mock calendar, only when VITE_CALENDAR_SOURCE=fixture

type FixtureDoc = {
  synthetic: boolean;
  model_version: string;
  note: string;
  cells?: number;
  columns: readonly string[];
  rows: ReadonlyArray<ReadonlyArray<string | number>>;
};

const FIXTURE_COLUMNS = [
  "year",
  "month",
  "period",
  "count",
  "ci_low",
  "ci_high",
  "is_estimated",
  "is_partial",
  "days_observed",
] as const;

const PERIODS: ReadonlyArray<Period> = ["ALL", "D", "N"];

/** Turn the compact fixture (column header + array rows) into typed months. Throws on a shape it does not know. */
export function parseFixture(doc: FixtureDoc): CalendarDataset {
  if (doc.columns.join(",") !== FIXTURE_COLUMNS.join(",")) {
    throw new Error(`Unexpected calendar columns: ${doc.columns.join(", ")}`);
  }
  const months = doc.rows.map((row, index): CalendarMonth => {
    const [year, month, period, count, ciLow, ciHigh, isEstimated, isPartial, daysObserved] = row;
    if (!PERIODS.includes(period as Period)) {
      throw new Error(`Row ${index}: unknown period "${String(period)}"`);
    }
    return {
      year: Number(year),
      month: Number(month),
      period: period as Period,
      count: Number(count),
      ciLow: Number(ciLow),
      ciHigh: Number(ciHigh),
      isEstimated: Number(isEstimated) === 1,
      isPartial: Number(isPartial) === 1,
      daysObserved: Number(daysObserved),
      medianHist: null,
      anomalyAbs: null,
      anomalyPct: null,
      anomalyZ: null,
      comparison: null,
      comparisonDays: null,
      comparisonYears: null,
    };
  });
  const years = months.map((m) => m.year);
  return {
    synthetic: doc.synthetic,
    modelVersion: doc.model_version,
    note: doc.note,
    period: null,
    cells: doc.cells ?? null,
    baselineYears: null,
    firstYear: Math.min(...years),
    lastYear: Math.max(...years),
    months,
  };
}

async function loadFixture(): Promise<CalendarDataset> {
  const module = await import("./fixtures/calendar-mock.json");
  return parseFixture(module.default);
}

// ---------------------------------------------------------------------------------------------------------

/**
 * Where the calendar comes from. By default the backend sums the cells of the area (`/api/calendar`).
 * With `VITE_CALENDAR_SOURCE=fixture` (an offline mock for building screens) it reads a small file of
 * SYNTHETIC numbers instead; the UI labels that data "Simulated".
 */
export async function loadCalendar(request: CalendarRequest, signal?: AbortSignal): Promise<CalendarDataset> {
  if (import.meta.env.VITE_CALENDAR_SOURCE === "fixture") return loadFixture();

  const { west, south, east, north } = request.area;
  const params = new URLSearchParams({
    west: String(west),
    south: String(south),
    east: String(east),
    north: String(north),
    period: request.period,
  });
  const response = await fetch(`/api/calendar?${params.toString()}`, { signal });
  if (!response.ok) throw new Error(await errorMessage(response));
  return parseApiResponse((await response.json()) as ApiCalendar);
}
