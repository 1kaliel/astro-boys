import { describe, expect, it } from "vitest";
import type { CalendarMonth } from "../data/calendarSource";
import {
  annualTotals,
  anomalyColor,
  anomalyLegend,
  anomalyStep,
  axisTicks,
  monthsOfYear,
  niceCeil,
  quantile,
  seasonalProfile,
} from "./charts";

function month(year: number, m: number, count: number | null, extra: Partial<CalendarMonth> = {}): CalendarMonth {
  return {
    year,
    month: m,
    period: "ALL",
    count,
    ciLow: null,
    ciHigh: null,
    isEstimated: year < 2012,
    isPartial: false,
    daysObserved: 30,
    medianHist: null,
    anomalyAbs: null,
    anomalyPct: null,
    anomalyZ: null,
    comparison: null,
    comparisonDays: null,
    comparisonYears: null,
    ...extra,
  };
}

function year(y: number, count: number, raw: { aqua: number | null; snpp: number | null }): CalendarMonth[] {
  return Array.from({ length: 12 }, (_, i) =>
    month(y, i + 1, count, { raw: { aqua: raw.aqua, terra: null, snpp: raw.snpp, n20: null } }),
  );
}

describe("annualTotals", () => {
  it("sums the harmonized series and each sensor on its own, never across sensors", () => {
    const rows = annualTotals([...year(2011, 50, { aqua: 10, snpp: null }), ...year(2013, 40, { aqua: 8, snpp: 40 })]);

    expect(rows).toEqual([
      { year: 2011, harmonized: 600, estimatedMonths: 12, rawAqua: 120, rawSnpp: null },
      { year: 2013, harmonized: 480, estimatedMonths: 0, rawAqua: 96, rawSnpp: 480 },
    ]);
  });

  it("gives no total to a year with a missing, partial or null month: an incomplete year is not a low year", () => {
    const missing = year(2002, 50, { aqua: 10, snpp: null }).slice(6);
    const partial = year(2026, 50, { aqua: 10, snpp: 50 }).map((m) => (m.month === 11 ? { ...m, isPartial: true } : m));
    const nullMonth = year(2005, 50, { aqua: 10, snpp: null }).map((m) => (m.month === 3 ? { ...m, count: null } : m));

    const rows = annualTotals([...missing, ...nullMonth, ...partial]);

    expect(rows.map((r) => [r.year, r.harmonized, r.rawAqua])).toEqual([
      [2002, null, null],
      [2005, null, 120], // the sensor counted every month, only the estimate is missing
      [2026, null, null],
    ]);
  });
});

describe("seasonalProfile", () => {
  it("takes the median and the 10th to 90th percentile of the complete months of the years shown", () => {
    const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => month(2000 + i, 9, i * 10));

    const september = seasonalProfile(months, 2001, 2011)[8];

    expect(september).toEqual({ month: 9, years: 11, p10: 20, median: 60, p90: 100 });
  });

  it("leaves out partial months, months without an estimate and years outside the range", () => {
    const months = [
      ...[1, 2, 3, 4, 5].map((i) => month(2010 + i, 9, 100)),
      month(2016, 9, 1, { isPartial: true }),
      month(2017, 9, null),
      month(2001, 9, 999999),
    ];

    const september = seasonalProfile(months, 2010, 2020)[8];

    expect(september.years).toBe(5);
    expect([september.p10, september.median, september.p90]).toEqual([100, 100, 100]);
  });

  it("has no band over too few years", () => {
    const profile = seasonalProfile([month(2015, 1, 5), month(2016, 1, 7)], 2000, 2030);

    expect(profile[0]).toEqual({ month: 1, years: 2, p10: null, median: null, p90: null });
    expect(profile).toHaveLength(12);
  });
});

describe("quantile and monthsOfYear", () => {
  it("interpolates between neighbours", () => {
    expect(quantile([0, 10], 0.25)).toBe(2.5);
    expect(quantile([7], 0.9)).toBe(7);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
  });

  it("returns the twelve months of a year in order, null where there is no row", () => {
    const rows = monthsOfYear([month(2002, 9, 5), month(2002, 7, null), month(2003, 1, 1)], 2002);

    expect(rows).toHaveLength(12);
    expect(rows[5]).toBeNull();
    expect(rows[6]?.count).toBeNull();
    expect(rows[8]?.count).toBe(5);
  });
});

describe("anomaly steps", () => {
  it("is zero around the median and grows with the size of the z-score, on both sides", () => {
    expect([0, 0.49, -0.49].map(anomalyStep)).toEqual([0, 0, 0]);
    expect([0.5, 1, 2, 3, 12].map(anomalyStep)).toEqual([1, 2, 3, 4, 4]);
    expect([-0.5, -1.5, -2, -9].map(anomalyStep)).toEqual([-1, -2, -3, -4]);
  });

  it("maps each step to a token of the diverging ramp", () => {
    expect(anomalyColor(0)).toBe("var(--viz-div-mid)");
    expect(anomalyColor(-4)).toBe("var(--viz-div-neg-4)");
    expect(anomalyColor(2)).toBe("var(--viz-div-pos-2)");
  });

  it("lists the nine classes of the legend from far below to far above", () => {
    const legend = anomalyLegend();

    expect(legend.map((item) => item.step)).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
    expect(legend[0].label).toBe("−3 or more");
    expect(legend[3].label).toBe("−0.5 to −1");
    expect(legend[4].label).toBe("±0.5");
    expect(legend[8].label).toBe("+3 or more");
  });
});

describe("axes", () => {
  it("rounds the top of an axis up to a round number", () => {
    expect([0, 1, 7, 18, 23, 4100, 733000].map(niceCeil)).toEqual([1, 1, 10, 20, 25, 5000, 1000000]);
  });

  it("spreads ticks evenly from zero", () => {
    expect(axisTicks(1000)).toEqual([0, 250, 500, 750, 1000]);
  });
});
