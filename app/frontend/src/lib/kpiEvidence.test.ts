import { describe, expect, it } from "vitest";
import type { CalendarMonth } from "../data/calendarSource";
import { activityEvidence, evidenceCsv, provenanceEvidence, seasonEvidence, ytdEvidence } from "./kpiEvidence";

const m = (year: number, month: number, over: Partial<CalendarMonth> = {}): CalendarMonth => ({
  year,
  month,
  period: "ALL",
  count: 100,
  ciLow: 100,
  ciHigh: 100,
  isEstimated: false,
  isPartial: false,
  daysObserved: 30,
  medianHist: 80,
  anomalyAbs: 20,
  anomalyPct: 25,
  anomalyZ: 1,
  comparison: "month",
  comparisonDays: null,
  comparisonYears: 5,
  sourceSatellite: "SNPP",
  ...over,
});

describe("evidence behind the cards", () => {
  it("a partial latest month says it is compared with the same days", () => {
    const e = activityEvidence(
      [m(2026, 11, { isPartial: true, daysObserved: 14, comparison: "same_days", comparisonDays: 14 })],
      [2012, 2025],
    )!;
    expect(e.rule).toContain("same 14 days");
    expect(e.excluded[0]).toContain("partial");
    expect(e.rows[0].note).toContain("S-NPP VIIRS");
  });
  it("year to date lists complete months and names the partial one it left out", () => {
    const e = ytdEvidence([m(2026, 1), m(2026, 2, { count: 50 }), m(2026, 3, { isPartial: true })])!;
    expect(e.rows.map((r) => r.label)).toEqual(["January 2026", "February 2026"]);
    expect(e.exact).toBe("150 against 160");
    expect(e.excluded).toHaveLength(1);
  });
  it("seasonality lists the monthly medians and marks the highest", () => {
    const e = seasonEvidence([m(2020, 9, { medianHist: 500 }), m(2020, 3, { medianHist: 50 })], [2012, 2019])!;
    expect(e.rows.find((r) => r.note === "Highest median")?.label).toBe("September");
  });
  it("provenance splits estimated from observed and keeps a missing count as empty, not zero", () => {
    const e = provenanceEvidence(
      [m(2010, 5, { isEstimated: true, sourceSatellite: "Aqua", count: null }), m(2020, 5)],
      2000,
      2026,
    );
    expect(e.exact).toBe("1 of 2 months");
    expect(e.rows[0].note).toContain("Estimated from MODIS");
    expect(evidenceCsv(e).split("\n")[1]).toContain(",,");
  });
  it("nothing to show gives null, not an invented card", () => {
    expect(activityEvidence([], null)).toBeNull();
    expect(ytdEvidence([m(2026, 1, { isPartial: true })])).toBeNull();
  });
});
