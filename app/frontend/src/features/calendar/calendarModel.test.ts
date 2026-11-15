import { describe, expect, it } from "vitest";
import { parseFixture, type CalendarMonth } from "../../data/calendarSource";
import {
  SEQ_BINS,
  binIndex,
  buildSeries,
  cellAriaLabel,
  provenanceText,
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

describe("binIndex", () => {
  it("maps the minimum to step 1 and the maximum to the last step", () => {
    expect(binIndex(0, 0, 100)).toBe(1);
    expect(binIndex(100, 0, 100)).toBe(SEQ_BINS);
  });

  it("is monotonic and stays inside 1..bins", () => {
    let previous = 0;
    for (let value = 0; value <= 100; value += 1) {
      const step = binIndex(value, 0, 100);
      expect(step).toBeGreaterThanOrEqual(previous);
      expect(step).toBeGreaterThanOrEqual(1);
      expect(step).toBeLessThanOrEqual(SEQ_BINS);
      previous = step;
    }
  });

  it("uses the middle step when there is no spread", () => {
    expect(binIndex(7, 7, 7)).toBe(Math.ceil(SEQ_BINS / 2));
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
    });
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
