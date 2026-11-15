import { describe, expect, it } from "vitest";
import type { CalendarMonth } from "../../data/calendarSource";
import { routeFromHash } from "../../lib/hashRoute";
import {
  driftOffset,
  foldWord,
  globeFraming,
  heroMonth,
  lastCompleteYear,
  monthLabel,
  recordFigures,
  sensorJump,
  yearlyTotals,
} from "./landingData";

function month(year: number, m: number, count: number | null, extra: Partial<CalendarMonth> = {}): CalendarMonth {
  return {
    year,
    month: m,
    period: "ALL",
    count,
    ciLow: count,
    ciHigh: count,
    isEstimated: year < 2012,
    isPartial: false,
    daysObserved: 30,
    medianHist: 100,
    anomalyAbs: null,
    anomalyPct: null,
    anomalyZ: null,
    comparison: "month",
    comparisonDays: null,
    comparisonYears: null,
    rawSource: count == null ? null : year < 2012 ? Math.round(count / 6) : count,
    ...extra,
  };
}

function year(y: number, counts: (m: number) => number): CalendarMonth[] {
  return Array.from({ length: 12 }, (_, i) => month(y, i + 1, counts(i + 1)));
}

const MONTHS: CalendarMonth[] = [
  ...year(2011, (m) => (m === 9 ? 600 : 60)),
  ...year(2012, (m) => (m === 10 ? 700 : 70)),
  // An unfinished year: never the "latest complete season".
  ...[1, 2, 3].map((m) => month(2013, m, m === 3 ? 5000 : 50, { isPartial: m === 3 })),
];

describe("routeFromHash", () => {
  it("sends the empty hash and #home to the landing, everything else to the explorer", () => {
    expect(routeFromHash("")).toBe("home");
    expect(routeFromHash("#")).toBe("home");
    expect(routeFromHash("#home")).toBe("home");
    expect(routeFromHash("#/Home")).toBe("home");
    expect(routeFromHash("#explore")).toBe("explore");
    expect(routeFromHash("#something-else")).toBe("explore");
  });
});

describe("hero month", () => {
  it("is the busiest month of the latest complete year", () => {
    expect(lastCompleteYear(MONTHS)).toBe(2012);
    expect(heroMonth(MONTHS)).toEqual({ year: 2012, month: 10 });
    expect(monthLabel({ year: 2012, month: 10 })).toBe("October 2012");
  });

  it("falls back to the peak complete month when no year is complete", () => {
    const partial = [month(2013, 1, 10), month(2013, 2, 40), month(2013, 3, 90, { isPartial: true })];
    expect(lastCompleteYear(partial)).toBeNull();
    expect(heroMonth(partial)).toEqual({ year: 2013, month: 2 });
    expect(heroMonth([])).toBeNull();
  });
});

describe("record figures", () => {
  it("sums the whole record, finds the peak month and counts months above usual", () => {
    const figures = recordFigures(MONTHS, 2011, 2013);
    expect(figures?.total).toBe(600 + 11 * 60 + 700 + 11 * 70 + 50 + 50 + 5000);
    expect(figures?.peak).toEqual({ year: 2013, month: 3, count: 5000, estimated: false });
    // Above the median of 100: Sep 2011 and Oct 2012 (the partial month is never judged).
    expect(figures?.above).toBe(2);
    expect(figures?.judged).toBe(26);
  });
});

describe("the 2012 story", () => {
  it("totals complete years only, raw next to harmonized", () => {
    const rows = yearlyTotals(MONTHS);
    expect(rows.map((r) => r.year)).toEqual([2011, 2012]);
    expect(rows[1]).toEqual({ year: 2012, raw: 700 + 11 * 70, harmonized: 700 + 11 * 70 });
  });

  it("measures the step at the sensor change", () => {
    const jump = sensorJump(yearlyTotals(MONTHS));
    expect(jump?.before.year).toBe(2011);
    expect(jump?.rawRatio).toBeGreaterThan(5);
    expect(jump?.harmonizedRatio).toBeCloseTo(1470 / 1260, 5);
    expect(sensorJump([])).toBeNull();
  });

  it("words the jump without overstating it", () => {
    expect(foldWord(9.29)).toBe("ninefold");
    expect(foldWord(2)).toBe("twofold");
    expect(foldWord(14.6)).toBe("15×");
  });
});

describe("globe framing", () => {
  it("puts a large globe on the right on wide screens and a smaller one above the text on phones", () => {
    const wide = globeFraming(1440, 900);
    expect(wide.padding.left).toBe(576);
    expect(wide.padding.bottom).toBe(0);
    expect(wide.diameter / 900).toBeGreaterThanOrEqual(0.85);
    expect(wide.diameter / 900).toBeLessThanOrEqual(0.95);
    // The zoom draws exactly that diameter: (512 * 2^zoom) / pi.
    expect((512 * 2 ** wide.zoom) / Math.PI).toBeCloseTo(wide.diameter, 3);
    const phone = globeFraming(375, 812);
    expect(phone.padding.left).toBe(0);
    expect(phone.padding.bottom).toBeGreaterThan(300);
    expect(phone.diameter).toBeLessThanOrEqual(375);
    expect(phone.zoom).toBeLessThan(wide.zoom);
  });

  it("drifts a few degrees around the study area and comes back", () => {
    expect(driftOffset(0)).toBe(0);
    expect(Math.abs(driftOffset(30_000))).toBeCloseTo(6, 5);
    expect(driftOffset(120_000)).toBeCloseTo(0, 5);
  });
});
