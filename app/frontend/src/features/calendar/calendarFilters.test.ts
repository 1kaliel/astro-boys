import { describe, expect, it } from "vitest";
import type { CalendarMonth } from "../../data/calendarSource";
import {
  NO_FILTERS,
  activeFilterCount,
  activeShortcut,
  countMatches,
  deviationBand,
  latestMonthIndex,
  monthIndex,
  passesFilters,
  shortcutRange,
} from "./calendarFilters";
import type { CalendarDatum, CalendarSerie } from "./calendarModel";
import { buildScale } from "./calendarModel";

const entry = (over: Partial<CalendarMonth> = {}): CalendarMonth => ({
  year: 2020,
  month: 5,
  period: "ALL",
  count: 100,
  ciLow: 100,
  ciHigh: 100,
  isEstimated: false,
  isPartial: false,
  daysObserved: 31,
  medianHist: 100,
  anomalyAbs: 0,
  anomalyPct: 0,
  anomalyZ: 0,
  comparison: "month",
  comparisonDays: null,
  comparisonYears: 5,
  ...over,
});
const datum = (over: Partial<CalendarMonth> | null, year = 2020, month = 5): CalendarDatum => ({
  x: "May",
  year,
  month,
  y: over === null ? null : over.count === undefined ? 100 : over.count,
  entry: over === null ? null : entry({ year, month, ...over }),
});
const ctx = { scale: buildScale([10, 50, 100, 500, 1000, 5000, 9000]), anomaly: false };

describe("deviation bands", () => {
  it("uses the robust z-score, and says when there is no valid comparison", () => {
    expect(deviationBand(entry({ anomalyZ: -1 }))).toBe("below");
    expect(deviationBand(entry({ anomalyZ: 0.99 }))).toBe("near");
    expect(deviationBand(entry({ anomalyZ: 1 }))).toBe("above");
    expect(deviationBand(entry({ anomalyZ: null }))).toBe("none");
    expect(deviationBand(null)).toBe("none");
  });
});

describe("passesFilters", () => {
  it("volume limits are inclusive and never turn a missing count into zero", () => {
    const f = { ...NO_FILTERS, volumeMin: 100, volumeMax: 500 };
    expect(passesFilters(datum({ count: 100 }), f, ctx)).toBe(true);
    expect(passesFilters(datum({ count: 500 }), f, ctx)).toBe(true);
    expect(passesFilters(datum({ count: 99 }), f, ctx)).toBe(false);
    expect(passesFilters(datum({ count: null }), f, ctx)).toBe(false);
    expect(passesFilters(datum(null), f, ctx)).toBe(true); // no data is not filtered, it stays "no data"
  });
  it("keeps a valid zero when only a maximum is set", () => {
    expect(passesFilters(datum({ count: 0 }), { ...NO_FILTERS, volumeMax: 10 }, ctx)).toBe(true);
  });
  it("deviation filter drops months without a comparison", () => {
    const f = { ...NO_FILTERS, deviation: ["above" as const] };
    expect(passesFilters(datum({ anomalyZ: 2 }), f, ctx)).toBe(true);
    expect(passesFilters(datum({ anomalyZ: null }), f, ctx)).toBe(false);
  });
  it("a window of months filters by position in time", () => {
    const f = { ...NO_FILTERS, range: { from: monthIndex(2020, 3), to: monthIndex(2020, 5) } };
    expect(passesFilters(datum({}, 2020, 5), f, ctx)).toBe(true);
    expect(passesFilters(datum({}, 2020, 6), f, ctx)).toBe(false);
  });
  it("legend steps pick colors; a zero is not a step", () => {
    const top = datum({ count: 9000 });
    const f = { ...NO_FILTERS, legend: [7] };
    expect(passesFilters(top, f, ctx)).toBe(true);
    expect(passesFilters(datum({ count: 10 }), f, ctx)).toBe(false);
    expect(passesFilters(datum({ count: 0 }), f, ctx)).toBe(false);
  });
});

describe("counting and shortcuts", () => {
  it("counts only months with data", () => {
    const series: CalendarSerie[] = [
      { id: "2020", data: [datum({ count: 5 }), datum(null, 2020, 6), datum({ count: 900 }, 2020, 7)] },
    ];
    expect(countMatches(series, { ...NO_FILTERS, volumeMin: 100 }, ctx)).toEqual({ total: 2, matching: 1 });
  });
  it("counts the active filters", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, volumeMin: 1, deviation: ["near"], legend: [2] })).toBe(3);
  });
  it("latest 12 months ends on the last month in the data and crosses the year", () => {
    const latest = latestMonthIndex([entry({ year: 2026, month: 3 }), entry({ year: 2025, month: 12 })])!;
    expect(latest).toBe(monthIndex(2026, 3));
    const s = shortcutRange("latest12", latest, 2002);
    expect(s.startYear).toBe(2025);
    expect(s.endYear).toBe(2026);
    expect(s.range).toEqual({ from: monthIndex(2025, 4), to: monthIndex(2026, 3) });
    expect(activeShortcut(2025, 2026, s.range, latest, 2002)).toBe("latest12");
  });
  it("full record and latest 5 years", () => {
    const latest = monthIndex(2026, 11);
    expect(shortcutRange("full", latest, 2002)).toEqual({ startYear: 2002, endYear: 2026, range: null });
    expect(shortcutRange("latest5y", latest, 2002).startYear).toBe(2022);
    expect(activeShortcut(2002, 2026, null, latest, 2002)).toBe("full");
  });
});
