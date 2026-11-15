import { describe, expect, it } from "vitest";
import type { CalendarMonth } from "../../data/calendarSource";
import { PILOT_BOUNDS } from "../../state/dashboard";
import { busiestEvidence, estimatedEvidence, latestEvidence, yearToDateEvidence } from "./kpiEvidence";

const month = (year: number, m: number, extra: Partial<CalendarMonth> = {}): CalendarMonth => ({
  year,
  month: m,
  period: "ALL",
  count: 1000 * m,
  ciLow: null,
  ciHigh: null,
  isEstimated: false,
  isPartial: false,
  daysObserved: 30,
  medianHist: 900 * m,
  anomalyAbs: null,
  anomalyPct: null,
  anomalyZ: null,
  comparison: "month",
  comparisonDays: null,
  comparisonYears: null,
  sourceSatellite: "SNPP",
  ...extra,
});

const context = { area: PILOT_BOUNDS, period: "ALL" as const, modelVersion: "v1-test", startYear: 2010, endYear: 2012 };

describe("KPI evidence", () => {
  it("names the satellite, the model and the API call behind the latest month", () => {
    const evidence = latestEvidence(month(2012, 3), context);
    expect(evidence.value).toBe("3,000 detections");
    expect(evidence.rows).toHaveLength(1);
    expect(evidence.source.instruments).toBe("S-NPP VIIRS");
    expect(evidence.source.modelVersion).toBe("v1-test");
    expect(evidence.source.apiUrl).toContain("/api/calendar?west=-48.8");
    expect(evidence.source.csvUrl).toContain("/api/hotspots.csv?");
    expect(evidence.source.csvUrl).toContain("start=2012-01-01");
  });

  it("says when there is no estimate, never zero", () => {
    const evidence = latestEvidence(month(2002, 8, { count: null, sourceSatellite: "Aqua" }), context);
    expect(evidence.value).toBe("No estimate for this month");
    expect(evidence.rows[0][1]).toBe("No estimate");
  });

  it("year so far leaves the partial month out and lists the complete ones", () => {
    const months = [month(2012, 1), month(2012, 2), month(2012, 3, { isPartial: true })];
    const evidence = yearToDateEvidence(months, context);
    expect(evidence?.rows.map((row) => row[0])).toEqual(["January 2012", "February 2012"]);
    expect(evidence?.value).toContain("3,000 detections in 2 complete months");
  });

  it("busiest month lists the medians of the months of the year", () => {
    const evidence = busiestEvidence([month(2011, 1), month(2011, 9), month(2011, 5)], context);
    expect(evidence.value).toContain("September");
    expect(evidence.rows.map((row) => row[0])).toEqual(["January", "May", "September"]);
    expect(evidence.source.csvUrl).toBeNull();
  });

  it("counts estimated and observed months per year", () => {
    const months = [
      month(2010, 1, { isEstimated: true, sourceSatellite: "Aqua" }),
      month(2010, 2, { isEstimated: true, sourceSatellite: "Aqua" }),
      month(2012, 5),
    ];
    const evidence = estimatedEvidence(months, context);
    expect(evidence.value).toBe("2 of 3 months estimated");
    expect(evidence.rows).toEqual([
      ["2010", "2", "0"],
      ["2012", "0", "1"],
    ]);
    expect(evidence.source.instruments).toBe("Aqua MODIS, S-NPP VIIRS");
  });
});

describe("estimated months card", () => {
  it("counts the whole record, not only the years on screen", () => {
    const months = [
      month(2003, 1, { isEstimated: true, sourceSatellite: "Aqua" }),
      month(2020, 1),
      month(2021, 1),
    ];
    const narrow = { ...context, startYear: 2020, endYear: 2021 };
    const evidence = estimatedEvidence(months, narrow);
    expect(evidence.value).toBe("1 of 3 months estimated");
    expect(evidence.rows.map((row) => row[0])).toEqual(["2003", "2020", "2021"]);
    expect(evidence.source.period).toContain("2003-2021");
  });
});
