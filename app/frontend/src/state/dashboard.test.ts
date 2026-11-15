import { describe, expect, it } from "vitest";
import { NO_FILTERS } from "../features/calendar/calendarFilters";
import { FIRST_YEAR, LAST_YEAR, PILOT_BOUNDS, dashboardReducer, type DashboardState } from "./dashboard";

const base: DashboardState = {
  area: PILOT_BOUNDS,
  period: "ALL",
  scale: "harmonized",
  metric: "count",
  startYear: FIRST_YEAR,
  endYear: LAST_YEAR,
  months: [],
  selected: { year: 2010, month: 9 },
  filters: NO_FILTERS,
  palette: "default",
};

describe("month filter in the shared state", () => {
  it("keeps the picked months sorted and unique", () => {
    expect(dashboardReducer(base, { type: "setMonths", months: [11, 9, 9, 10] }).months).toEqual([9, 10, 11]);
  });

  it("drops months outside 1 to 12", () => {
    expect(dashboardReducer(base, { type: "setMonths", months: [0, 3, 13] }).months).toEqual([3]);
  });

  it("treats all twelve months as no filter", () => {
    const all = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(dashboardReducer({ ...base, months: [9] }, { type: "setMonths", months: all }).months).toEqual([]);
  });

  it("clears the filter with an empty list", () => {
    expect(dashboardReducer({ ...base, months: [9, 10] }, { type: "setMonths", months: [] }).months).toEqual([]);
  });

  it("leaves the rest of the state alone, including the selected month", () => {
    const next = dashboardReducer(base, { type: "setMonths", months: [9] });
    expect({ ...next, months: base.months }).toEqual(base);
    expect(next.selected).toEqual({ year: 2010, month: 9 });
  });
});

describe("calendar filters in the shared state", () => {
  it("orders a volume range, drops negatives, and clears everything at once", () => {
    const v = dashboardReducer(base, { type: "setVolume", min: 500, max: 100 });
    expect([v.filters.volumeMin, v.filters.volumeMax]).toEqual([100, 500]);
    expect(dashboardReducer(base, { type: "setVolume", min: -3, max: null }).filters.volumeMin).toBeNull();
    const withAll = dashboardReducer(v, { type: "setDeviation", bands: ["above"] });
    expect(dashboardReducer(withAll, { type: "clearFilters" }).filters).toEqual(NO_FILTERS);
  });
  it("a shortcut sets the years and the window; picking years by hand drops the window", () => {
    const s = dashboardReducer(base, { type: "setRange", startYear: 2025, endYear: 2026, range: { from: 1, to: 12 } });
    expect(s.filters.range).toEqual({ from: 1, to: 12 });
    expect(dashboardReducer(s, { type: "setYears", startYear: 2020, endYear: 2026 }).filters.range).toBeNull();
  });
  it("legend steps reset when the view changes; deviation resets on the raw scale", () => {
    const s = dashboardReducer(base, { type: "setLegend", steps: [3, 1, 3] });
    expect(s.filters.legend).toEqual([1, 3]);
    expect(dashboardReducer(s, { type: "setMetric", metric: "anomaly" }).filters.legend).toEqual([]);
    const d = dashboardReducer(base, { type: "setDeviation", bands: ["below"] });
    expect(dashboardReducer(d, { type: "setScale", scale: "raw" }).filters.deviation).toEqual([]);
  });
});
