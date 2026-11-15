import { describe, expect, it } from "vitest";
import { parseApiResponse, parseFixture, type ApiCalendar, type CalendarMonth } from "../../data/calendarSource";
import {
  SEQ_BINS,
  buildScale,
  buildSeries,
  cellAriaLabel,
  legendRanges,
  monthSpan,
  peakSeason,
  provenanceText,
  scaleStep,
  valueRange,
} from "./calendarModel";
import { MONTH_LOCALE, monthLong, monthShort } from "./calendarText";

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
    comparison: null,
    comparisonDays: null,
    comparisonYears: null,
    ...overrides,
  };
}

describe("buildSeries", () => {
  it("returns one row per year with twelve months", () => {
    const series = buildSeries([month({})], "ALL", 2009, 2011);
    expect(series.map((row) => row.id)).toEqual(["2009", "2010", "2011"]);
    expect(series.every((row) => row.data.length === 12)).toBe(true);
    expect(series[0].data.map((cell) => cell.x)[0]).toBe(monthShort(1));
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
    expect(row.data.map((cell) => cell.x)).toEqual([monthShort(9), monthShort(10), monthShort(11)]);
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

  it("gives each color a range of detections for the legend, ending at the maximum", () => {
    const scale = buildScale(skewed)!;
    const ranges = legendRanges(scale);
    expect(ranges).toHaveLength(scale.breaks.length + 1);
    expect(ranges[0].from).toBe(1);
    expect(ranges[ranges.length - 1].to).toBe(5000);
    expect(ranges[ranges.length - 1].includesTo).toBe(true);
    expect(ranges.slice(0, -1).every((range) => !range.includesTo)).toBe(true);
    // ranges touch: each one starts where the previous one stops
    expect(ranges.slice(1).map((range) => range.from)).toEqual(ranges.slice(0, -1).map((range) => range.to));
    expect(ranges.map((range) => range.step)).toEqual([...ranges.map((range) => range.step)].sort((a, b) => a - b));
    expect(ranges[0].label).toBe("1–3");
    expect(ranges[ranges.length - 1].label).toBe("40–5K");
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
    expect(monthSpan([9, 10, 11])).toBe(`${monthShort(9)}–${monthShort(11)}`);
    expect(monthSpan([11, 12, 1])).toBe(`${monthShort(11)}–${monthShort(1)}`);
    expect(monthSpan([3])).toBe(monthShort(3));
  });

  it("lists months that are not consecutive instead of implying a range", () => {
    expect(monthSpan([1, 3])).toBe(`${monthShort(1)}, ${monthShort(3)}`);
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
      `${monthLong(3)} 2010: 1,240 hotspot detections. Estimated from MODIS`,
    );
    expect(cellAriaLabel(row.data[0])).toBe(`${monthLong(1)} 2010: no data`);
  });

  it("describes a month without an estimate, not as zero and not as no data", () => {
    const [row] = buildSeries([month({ month: 3, count: null, isEstimated: true, isPartial: true, daysObserved: 20 })], "ALL", 2010, 2010);
    expect(cellAriaLabel(row.data[2])).toBe(
      `${monthLong(3)} 2010: no estimate. Estimated from MODIS. Partial month (20 days observed)`,
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
      comparison: null,
      comparisonDays: null,
      comparisonYears: null,
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

  it("reads what the median is the median of: whole months, or the same days of an unfinished month", () => {
    const [full] = parseApiResponse({ ...doc, months: [{ ...apiMonth, median_n_years: 23, median_days: null }] }).months;
    expect([full.comparison, full.comparisonDays, full.comparisonYears]).toEqual(["month", null, 23]);

    const sameDays = { ...apiMonth, is_partial: true, days_observed: 14, median_n_years: 13, median_days: 14 };
    const [partial] = parseApiResponse({ ...doc, months: [sameDays] }).months;
    expect([partial.comparison, partial.comparisonDays, partial.comparisonYears]).toEqual(["same_days", 14, 13]);

    const [none] = parseApiResponse({ ...doc, months: [{ ...apiMonth, median_hist: null }] }).months;
    expect(none.comparison).toBeNull();
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

describe("zero, estimated and no data stay apart", () => {
  const zeroMonth = month({ month: 1, count: 0, isEstimated: false, ciLow: 0, ciHigh: 0 });
  const positive = [5, 10, 20, 40, 80, 160, 320].map((count, index) => month({ month: index + 2, count }));

  it("keeps a valid zero as 0 and a missing month as null", () => {
    const [row] = buildSeries([zeroMonth, ...positive], "ALL", 2010, 2010);
    expect(row.data[0].y).toBe(0);
    expect(row.data[0].entry).not.toBeNull();
    // month 9 has no row: no data
    expect(row.data[8].y).toBeNull();
    expect(row.data[8].entry).toBeNull();
  });

  it("sets zeros aside so they do not take a color step", () => {
    const values = [0, 0, 0, 0, 0, 0, 0, 5, 10, 20, 40, 80, 160, 320];
    const withZeros = buildScale(values)!;
    const withoutZeros = buildScale(values.filter((v) => v > 0))!;
    expect(withZeros).toEqual(withoutZeros);
    expect(withZeros.min).toBe(5);
  });

  it("has a scale with no colors when every value is zero", () => {
    const scale = buildScale([0, 0, 0])!;
    expect(scale.max).toBe(0);
    expect(legendRanges(scale)).toEqual([]);
  });

  it("describes a zero as a count and a missing month as no data", () => {
    const [row] = buildSeries([zeroMonth], "ALL", 2010, 2010);
    expect(cellAriaLabel(row.data[0])).toBe(`${monthLong(1)} 2010: 0 hotspot detections. Observed by VIIRS`);
    expect(cellAriaLabel(row.data[1])).toBe(`${monthLong(2)} 2010: no data`);
  });
});

describe("month names", () => {
  it("are 12 short names and 12 long names", () => {
    const short = Array.from({ length: 12 }, (_, i) => monthShort(i + 1));
    const long = Array.from({ length: 12 }, (_, i) => monthLong(i + 1));
    expect(new Set(short).size).toBe(12);
    expect(new Set(long).size).toBe(12);
  });

  it("are English (the project language, required by the challenge)", () => {
    expect(MONTH_LOCALE).toBe("en");
    expect(Array.from({ length: 12 }, (_, i) => monthShort(i + 1))).toEqual([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ]);
  });
});
