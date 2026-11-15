import { describe, expect, it } from "vitest";
import type { CalendarMonth } from "../data/calendarSource";
import {
  busiestMonth,
  deltaText,
  estimatedShare,
  inYears,
  latestComparison,
  latestKpiText,
  percentChange,
  yearToDate,
} from "./metrics";

function month(year: number, m: number, value: number, extra: Partial<CalendarMonth> = {}): CalendarMonth {
  const estimated = year < 2012 || (year === 2012 && m < 2);
  return {
    year,
    month: m,
    period: "ALL",
    count: value,
    ciLow: estimated ? null : value,
    ciHigh: estimated ? null : value,
    isEstimated: estimated,
    isPartial: false,
    daysObserved: 30,
    medianHist: 100,
    anomalyAbs: value - 100,
    anomalyPct: value - 100,
    anomalyZ: null,
    comparison: null,
    comparisonDays: null,
    comparisonYears: null,
    ...extra,
  };
}

describe("metrics", () => {
  it("filters years and counts estimated months", () => {
    const months = [month(2010, 1, 1), month(2011, 1, 1), month(2013, 1, 1)];
    expect(inYears(months, 2011, 2013).map((m) => m.year)).toEqual([2011, 2013]);
    expect(estimatedShare(months)).toEqual({ estimated: 2, total: 3 });
  });

  it("finds the busiest month of the year from the historical medians, ignoring partial months", () => {
    const months = [
      month(2020, 8, 10, { medianHist: 500 }),
      month(2020, 9, 10, { medianHist: 900 }),
      month(2025, 10, 10, { medianHist: 5000, isPartial: true }),
    ];
    expect(busiestMonth(months)).toEqual({ month: 9, median: 900 });
  });

  it("compares the complete months of the latest year with the sum of their medians, leaving partial months out", () => {
    const months = [
      month(2024, 12, 50),
      month(2025, 1, 120),
      month(2025, 2, 80),
      month(2025, 3, 5, { isPartial: true, medianHist: 400 }),
    ];
    expect(yearToDate(months)).toEqual({ year: 2025, value: 200, median: 200, months: 2, partial: true });
    expect(yearToDate([month(2025, 1, 1, { medianHist: null })])).toBeNull();
    expect(yearToDate([month(2025, 1, 1, { isPartial: true })])).toBeNull();
  });

  it("percent change is undefined when the base is zero", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(5, 0)).toBeNull();
  });
});

describe("latestComparison", () => {
  it("compares a complete month with the median of that month", () => {
    const full = month(2025, 11, 80, { medianHist: 100, comparison: "month" });
    expect(latestComparison(full)).toEqual({ kind: "month", base: 100 });
  });

  it("compares an unfinished month with the same days of earlier years (like for like)", () => {
    const partial = month(2026, 11, 20, {
      isPartial: true,
      daysObserved: 14,
      medianHist: 22.5,
      comparison: "same_days",
      comparisonDays: 14,
      comparisonYears: 13,
    });
    expect(latestComparison(partial)).toEqual({ kind: "same_days", base: 22.5, days: 14, years: 13 });
  });

  it("never sets an unfinished month against full months: with no same-days history there is no comparison", () => {
    // the API may still send a full-month median for a partial month ("month"); it must not be used
    const partial = month(2026, 11, 20, { isPartial: true, daysObserved: 14, medianHist: 100, comparison: "month" });
    expect(latestComparison(partial)).toEqual({ kind: "none" });
    expect(latestComparison({ ...partial, comparison: null, medianHist: null })).toEqual({ kind: "none" });
  });

  it("does not compare when the same-days median is missing", () => {
    const partial = month(2026, 11, 20, {
      isPartial: true,
      medianHist: null,
      comparison: "same_days",
      comparisonDays: 14,
      comparisonYears: 13,
    });
    expect(latestComparison(partial)).toEqual({ kind: "none" });
  });
});

describe("deltaText", () => {
  it("says the size and direction in words, with an arrow and the baseline value", () => {
    expect(deltaText(40, 100, "the March median")).toBe("▼ 60% below the March median (100)");
    expect(deltaText(150, 100, "the March median")).toBe("▲ 50% above the March median (100)");
    expect(deltaText(100, 100, "the March median")).toBe("Equal to the March median (100)");
    expect(deltaText(5, null, "the March median")).toBe("No comparison available");
  });
});

describe("latestKpiText", () => {
  it("splits the hero into unit and period (detail) and the delta on its own line (comparison)", () => {
    const partial = month(2026, 11, 20_300, {
      isPartial: true,
      daysObserved: 14,
      medianHist: 22_800,
      comparison: "same_days",
      comparisonDays: 14,
      comparisonYears: 13,
    });
    expect(latestKpiText(partial)).toEqual({
      detail: "VIIRS-equivalent hotspots · November 1–14, 2026",
      comparison: "▼ 11% below the median of the same 14 days (22.8K), 13 earlier years",
    });
  });

  it("compares a complete month with the median of that month", () => {
    const full = month(2025, 10, 80, { medianHist: 100, comparison: "month" });
    expect(latestKpiText(full)).toEqual({
      detail: "VIIRS-equivalent hotspots · October 2025",
      comparison: "▼ 20% below the October median (100)",
    });
  });

  it("never compares a partial month with full months, and has no comparison without an estimate or data", () => {
    const partial = month(2026, 11, 20, { isPartial: true, daysObserved: 14, comparison: "month" });
    expect(latestKpiText(partial).comparison).toBe("Partial month, not compared with the November median");
    expect(latestKpiText({ ...partial, isPartial: false, count: null })).toEqual({
      detail: "VIIRS-equivalent hotspots · November 2026 · no estimate for this month",
    });
    expect(latestKpiText(null)).toEqual({ detail: "No data" });
  });
});
