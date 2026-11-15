import { describe, expect, it } from "vitest";
import { parseApiResponse, parseFixture, type ApiCalendar, type CalendarMonth } from "../../data/calendarSource";
import {
  SEQ_BINS,
  buildScale,
  buildSeries,
  cellAriaLabel,
  legendStops,
  monthSpan,
  peakSeason,
  provenanceText,
  scaleStep,
  valueRange,
} from "./calendarModel";

function month(overrides: Partial<CalendarMonth>): CalendarMonth {
  return {
    year: 2010,
    month: 3,
    period: "ALL",
    count: 100,
    ciLow: 90,
    ciHigh: 110,
    isEstimated: true,
    isPartial: false,
    daysObserved: 31,
    medianHist: null,
    anomalyAbs: null,
    anomalyPct: null,
    anomalyZ: null,
    ...overrides,
  };
}

describe("buildSeries", () => {
  it("returns one row per year with twelve months", () => {
    const series = buildSeries([month({})], "ALL", 2009, 2011);
    expect(series.map((row) => row.id)).toEqual(["2009", "2010", "2011"]);
    expect(series.every((row) => row.data.length === 12)).toBe(true);
    expect(series[0].data.map((cell) => cell.x)[0]).toBe("Jan");
  });

  it("puts the count in the right cell and leaves missing months as no data, never zero", () => {
    const series = buildSeries([month({ year: 2010, month: 3, count: 42 })], "ALL", 2010, 2010);
    const [row] = series;
    expect(row.data[2].y).toBe(42);
    expect(row.data[2].entry?.count).toBe(42);
    expect(row.data[0].y).toBeNull();
    expect(row.data[0].entry).toBeNull();
  });

  it("keeps only the selected period", () => {
    const rows = [month({ period: "D", count: 1 }), month({ period: "N", count: 2 }), month({ period: "ALL", count: 3 })];
    expect(buildSeries(rows, "N", 2010, 2010)[0].data[2].y).toBe(2);
    expect(buildSeries(rows, "ALL", 2010, 2010)[0].data[2].y).toBe(3);
  });

  it("ignores months outside the year range", () => {
    const series = buildSeries([month({ year: 2005 })], "ALL", 2010, 2011);
    expect(valueRange(series)).toBeNull();
  });
});

describe("valueRange", () => {
  it("ignores no-data cells", () => {
    const series = buildSeries(
      [month({ month: 1, count: 5 }), month({ month: 2, count: 50 })],
      "ALL",
      2010,
      2010,
    );
    expect(valueRange(series)).toEqual({ min: 5, max: 50 });
  });

  it("is null when nothing has data", () => {
    expect(valueRange(buildSeries([], "ALL", 2010, 2011))).toBeNull();
  });
});

describe("buildSeries with a month filter", () => {
  const rows = [1, 5, 9, 10, 11].map((m) => month({ month: m, count: m * 10 }));

  it("keeps all twelve months when no month is picked", () => {
    expect(buildSeries(rows, "ALL", 2010, 2010)[0].data).toHaveLength(12);
    expect(buildSeries(rows, "ALL", 2010, 2010, [])[0].data).toHaveLength(12);
  });

  it("keeps only the picked months, in calendar order", () => {
    const [row] = buildSeries(rows, "ALL", 2010, 2010, [11, 9, 10]);
    expect(row.data.map((cell) => cell.x)).toEqual(["Sep", "Oct", "Nov"]);
    expect(row.data.map((cell) => cell.y)).toEqual([90, 100, 110]);
  });

  it("shows a picked month without data as no data, not as zero", () => {
    const [row] = buildSeries(rows, "ALL", 2010, 2010, [2, 5]);
    expect(row.data.map((cell) => cell.y)).toEqual([null, 50]);
  });
});

describe("color scale", () => {
  const skewed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 5000];

  it("splits the values into groups of about the same size, not equal-width steps", () => {
    const scale = buildScale(skewed)!;
    const steps = skewed.map((v) => scaleStep(v, scale));
    // equal-width steps over 1..5000 would put 13 of the 14 values in the first step
    expect(steps.filter((step) => step === 1).length).toBeLessThanOrEqual(3);
    expect(new Set(steps).size).toBe(SEQ_BINS);
    expect(scaleStep(5000, scale)).toBe(SEQ_BINS);
    expect(scaleStep(1, scale)).toBe(1);
  });

  it("is monotonic: a bigger value never gets a lighter step", () => {
    const scale = buildScale(skewed)!;
    let previous = 0;
    for (const value of [...skewed].sort((a, b) => a - b)) {
      const step = scaleStep(value, scale);
      expect(step).toBeGreaterThanOrEqual(previous);
      previous = step;
    }
  });

  it("has unique ascending limits and never an empty color", () => {
    const scale = buildScale([5, 5, 5, 5, 5, 5, 5, 9, 9, 9, 100])!;
    expect(new Set(scale.breaks).size).toBe(scale.breaks.length);
    expect([...scale.breaks].sort((a, b) => a - b)).toEqual(scale.breaks);
    expect(scale.breaks.every((limit) => limit > scale.min)).toBe(true);
  });

  it("spreads few colors over the whole ramp, so the contrast does not shrink", () => {
    const scale = buildScale([5, 5, 5, 5, 100, 100, 100, 100])!;
    expect(scale.breaks).toEqual([100]);
    expect(scaleStep(5, scale)).toBe(1);
    expect(scaleStep(100, scale)).toBe(SEQ_BINS);
  });

  it("uses the middle color when every value is the same", () => {
    const scale = buildScale([7, 7, 7])!;
    expect(scaleStep(7, scale)).toBe(Math.ceil(SEQ_BINS / 2));
  });

  it("has no scale without values", () => {
    expect(buildScale([])).toBeNull();
  });

  it("prints where each color starts, with the limits in the legend", () => {
    const scale = buildScale(skewed)!;
    const stops = legendStops(scale);
    expect(stops).toHaveLength(scale.breaks.length + 1);
    expect(stops[0].label).toBe("1");
    expect(stops[1].label.startsWith("≥ ")).toBe(true);
    expect(stops.map((stop) => stop.step)).toEqual([...stops.map((stop) => stop.step)].sort((a, b) => a - b));
  });
});

describe("peakSeason", () => {
  const year = (y: number, counts: Record<number, number>, partial: number[] = []) =>
    Object.entries(counts).map(([m, count]) =>
      month({ year: y, month: Number(m), count, isPartial: partial.includes(Number(m)) }),
    );
  // September to November is the strong season in every year
  const rows = [2010, 2011, 2012].flatMap((y) => year(y, { 1: 5, 6: 10, 8: 60, 9: 120, 10: 125, 11: 62, 12: 36 }));

  it("finds the three consecutive months with the highest typical activity", () => {
    const series = buildSeries(rows, "ALL", 2010, 2012);
    expect(peakSeason(series)).toEqual([9, 10, 11]);
  });

  it("wraps over the year end", () => {
    const winter = [2010, 2011, 2012].flatMap((y) => year(y, { 11: 90, 12: 100, 1: 95, 6: 10, 7: 5 }));
    expect(peakSeason(buildSeries(winter, "ALL", 2010, 2012))).toEqual([11, 12, 1]);
  });

  it("ignores partial months: an incomplete month is not 'low' and not 'peak'", () => {
    const withPartial = [
      ...year(2010, { 9: 100, 10: 100, 11: 100, 12: 1 }),
      ...year(2011, { 9: 100, 10: 100, 11: 100, 12: 1 }),
      ...year(2012, { 9: 1, 10: 1, 11: 1, 12: 400 }, [9, 10, 11, 12]),
    ];
    expect(peakSeason(buildSeries(withPartial, "ALL", 2010, 2012))).toEqual([9, 10, 11]);
  });

  it("is null with fewer than three months of data", () => {
    expect(peakSeason(buildSeries(year(2010, { 9: 1, 10: 2 }), "ALL", 2010, 2010))).toBeNull();
  });
});

describe("monthSpan", () => {
  it("writes runs as a range, including over the year end", () => {
    expect(monthSpan([9, 10, 11])).toBe("Sep–Nov");
    expect(monthSpan([11, 12, 1])).toBe("Nov–Jan");
    expect(monthSpan([3])).toBe("Mar");
  });

  it("lists months that are not consecutive instead of implying a range", () => {
    expect(monthSpan([1, 3])).toBe("Jan, Mar");
    expect(monthSpan([])).toBe("");
  });
});

describe("labels", () => {
  it("says estimated or observed, and flags a partial month", () => {
    expect(provenanceText(month({ isEstimated: true }))).toBe("Estimated from MODIS");
    expect(provenanceText(month({ isEstimated: false }))).toBe("Observed by VIIRS");
    expect(provenanceText(month({ isEstimated: false, isPartial: true, daysObserved: 14 }))).toBe(
      "Observed by VIIRS. Partial month (14 days observed)",
    );
  });

  it("describes a cell for screen readers, with 'no data' for a missing month", () => {
    const [row] = buildSeries([month({ month: 3, count: 1240 })], "ALL", 2010, 2010);
    expect(cellAriaLabel(row.data[2])).toBe(
      "March 2010: 1,240 hotspot detections. Estimated from MODIS",
    );
    expect(cellAriaLabel(row.data[0])).toBe("January 2010: no data");
  });

  it("describes a month without an estimate, not as zero and not as no data", () => {
    const [row] = buildSeries([month({ month: 3, count: null, isEstimated: true, isPartial: true, daysObserved: 20 })], "ALL", 2010, 2010);
    expect(cellAriaLabel(row.data[2])).toBe(
      "March 2010: no estimate. Estimated from MODIS. Partial month (20 days observed)",
    );
  });

  it("never calls detections fires", () => {
    const [row] = buildSeries([month({})], "ALL", 2010, 2010);
    expect(cellAriaLabel(row.data[2]).toLowerCase()).not.toContain("fire");
  });
});

describe("parseFixture", () => {
  const columns = ["year", "month", "period", "count", "ci_low", "ci_high", "is_estimated", "is_partial", "days_observed"];

  it("turns compact rows into typed months", () => {
    const dataset = parseFixture({
      synthetic: true,
      model_version: "MOCK",
      note: "synthetic",
      columns,
      rows: [[2003, 1, "ALL", 230.4, 212.4, 248.4, 1, 0, 31]],
    });
    expect(dataset.synthetic).toBe(true);
    expect(dataset.months[0]).toEqual({
      year: 2003,
      month: 1,
      period: "ALL",
      count: 230.4,
      ciLow: 212.4,
      ciHigh: 248.4,
      isEstimated: true,
      isPartial: false,
      daysObserved: 31,
      medianHist: null,
      anomalyAbs: null,
      anomalyPct: null,
      anomalyZ: null,
    });
    expect(dataset.period).toBeNull();
    expect([dataset.firstYear, dataset.lastYear]).toEqual([2003, 2003]);
  });

  it("rejects unknown columns and unknown periods", () => {
    expect(() => parseFixture({ synthetic: true, model_version: "MOCK", note: "", columns: ["a"], rows: [] })).toThrow();
    expect(() =>
      parseFixture({
        synthetic: true,
        model_version: "MOCK",
        note: "",
        columns,
        rows: [[2003, 1, "X", 1, 1, 1, 0, 0, 1]],
      }),
    ).toThrow(/unknown period/);
  });
});

describe("parseApiResponse", () => {
  const apiMonth = {
    year: 2010,
    month: 8,
    count_harmonized: 133812.4,
    ci_low: null,
    ci_high: null,
    is_estimated: true,
    is_partial: false,
    days_observed: 31,
    median_hist: 58825.7,
    anomaly_abs: 74986.7,
    anomaly_pct: 127.5,
    anomaly_z: 4.5,
  };
  const doc: ApiCalendar = {
    area: { cells: 3112 },
    period: "N",
    model_version: "fb-l1-terra-3",
    interval_is_approximate: true,
    baseline_years: [2003, 2025],
    first_year: 2003,
    last_year: 2025,
    months: [apiMonth],
  };

  it("maps the snake_case answer to typed months and keeps the pending interval as null, not zero", () => {
    const dataset = parseApiResponse(doc);

    expect(dataset.synthetic).toBe(false);
    expect(dataset.period).toBe("N");
    expect(dataset.cells).toBe(3112);
    expect(dataset.baselineYears).toEqual([2003, 2025]);
    expect([dataset.firstYear, dataset.lastYear]).toEqual([2003, 2025]);
    const [month] = dataset.months;
    expect(month.period).toBe("N");
    expect(month.count).toBe(133812.4);
    expect(month.ciLow).toBeNull();
    expect(month.ciHigh).toBeNull();
    expect(month.isEstimated).toBe(true);
    expect([month.medianHist, month.anomalyAbs, month.anomalyPct, month.anomalyZ]).toEqual([58825.7, 74986.7, 127.5, 4.5]);
  });

  it("says whether the interval of the area is approximate", () => {
    expect(parseApiResponse(doc).intervalApproximate).toBe(true);
    expect(parseApiResponse({ ...doc, interval_is_approximate: false }).intervalApproximate).toBe(false);
  });

  it("keeps a month without an estimate as null, not zero", () => {
    const dataset = parseApiResponse({
      ...doc,
      months: [{ ...apiMonth, count_harmonized: null, ci_low: null, ci_high: null, is_partial: true }],
    });
    const [month] = dataset.months;
    expect(month.count).toBeNull();
    expect(month.isPartial).toBe(true);
    // it is still a month of the calendar, shown as "no estimate" and never as a low value
    const [row] = buildSeries(dataset.months, "N", 2010, 2010);
    expect(row.data[7].y).toBeNull();
    expect(row.data[7].entry).not.toBeNull();
  });

  it("rejects an answer that is not a calendar", () => {
    expect(() => parseApiResponse({ detail: "nope" } as unknown as ApiCalendar)).toThrow(/unexpected format/);
  });
});

describe("a dataset read with its own period", () => {
  it("builds the rows from the months of that period even if the selector moved on", () => {
    const dataset = parseApiResponse({
      area: { cells: 1 },
      period: "D",
      model_version: "m",
      interval_is_approximate: false,
      baseline_years: null,
      first_year: 2010,
      last_year: 2010,
      months: [
        {
          year: 2010,
          month: 3,
          count_harmonized: 5,
          ci_low: 5,
          ci_high: 5,
          is_estimated: false,
          is_partial: false,
          days_observed: 31,
          median_hist: null,
          anomaly_abs: null,
          anomaly_pct: null,
          anomaly_z: null,
        },
      ],
    });
    const series = buildSeries(dataset.months, dataset.period ?? "ALL", 2010, 2010);

    expect(valueRange(series)).toEqual({ min: 5, max: 5 });
  });
});
