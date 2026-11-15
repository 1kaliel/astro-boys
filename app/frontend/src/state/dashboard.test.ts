import { describe, expect, it } from "vitest";
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
  drillCell: null,
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

describe("drill-down cell in the shared state", () => {
  const drilled: DashboardState = { ...base, drillCell: "G080140.06" };

  it("enters and leaves the drill-down", () => {
    expect(dashboardReducer(base, { type: "drill", cell: "G080140.06" }).drillCell).toBe("G080140.06");
    expect(dashboardReducer(drilled, { type: "drill", cell: "G080140.07" }).drillCell).toBe("G080140.07");
    expect(dashboardReducer(drilled, { type: "undrill" }).drillCell).toBeNull();
  });

  it("is cleared when another month is selected, and kept when the same month is selected again", () => {
    expect(dashboardReducer(drilled, { type: "select", year: 2010, month: 10 }).drillCell).toBeNull();
    expect(dashboardReducer(drilled, { type: "select", year: 2011, month: 9 }).drillCell).toBeNull();
    expect(dashboardReducer(drilled, { type: "select", year: 2010, month: 9 }).drillCell).toBe("G080140.06");
  });

  it("is cleared when a month is picked for the first time (the map showed the latest month)", () => {
    const latest: DashboardState = { ...drilled, selected: null };
    expect(dashboardReducer(latest, { type: "select", year: 2026, month: 10 }).drillCell).toBeNull();
  });

  it("is cleared when the period changes", () => {
    expect(dashboardReducer(drilled, { type: "setPeriod", period: "N" }).drillCell).toBeNull();
    expect(dashboardReducer(drilled, { type: "setPeriod", period: "ALL" }).drillCell).toBe("G080140.06");
  });

  it("is cleared when the area changes", () => {
    const area = { west: -41, south: -10, east: -40, north: -9 };
    expect(dashboardReducer(drilled, { type: "setArea", area }).drillCell).toBeNull();
    expect(dashboardReducer(drilled, { type: "setArea", area: { ...PILOT_BOUNDS } }).drillCell).toBe("G080140.06");
  });

  it("is kept by the filters that do not change the map's slice", () => {
    expect(dashboardReducer(drilled, { type: "setScale", scale: "raw" }).drillCell).toBe("G080140.06");
    expect(dashboardReducer(drilled, { type: "setMetric", metric: "anomaly" }).drillCell).toBe("G080140.06");
    expect(dashboardReducer(drilled, { type: "setMonths", months: [9] }).drillCell).toBe("G080140.06");
    expect(dashboardReducer(drilled, { type: "setYears", startYear: 2005, endYear: 2015 }).drillCell).toBe("G080140.06");
  });
});
