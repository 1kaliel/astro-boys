import type { Period } from "../state/dashboard";

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
  /** 90% interval. Equal to `count` for observed months. */
  ciLow: number;
  ciHigh: number;
  /** Estimated from MODIS (before 2012-02), as opposed to observed by VIIRS. */
  isEstimated: boolean;
  /** The month is not complete yet. */
  isPartial: boolean;
  daysObserved: number;
};

export type CalendarDataset = {
  /** True while the data is the mock: synthetic numbers, for building screens only. */
  synthetic: boolean;
  modelVersion: string;
  note: string;
  months: CalendarMonth[];
};

type FixtureDoc = {
  synthetic: boolean;
  model_version: string;
  note: string;
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
    };
  });
  return { synthetic: doc.synthetic, modelVersion: doc.model_version, note: doc.note, months };
}

/**
 * Where the calendar comes from. Today: a small fixture built from the SYNTHETIC mock calendar.
 * Task D2 replaces this body with a call to the backend (e.g. `GET /api/calendar?...`) that sums the
 * cells of the selected area; the rest of the calendar does not change.
 */
export async function loadCalendar(): Promise<CalendarDataset> {
  const module = await import("./fixtures/calendar-mock.json");
  return parseFixture(module.default);
}
