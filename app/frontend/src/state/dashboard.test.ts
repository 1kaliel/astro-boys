import { describe, expect, it } from "vitest";
import { FIRST_YEAR, LAST_YEAR, PILOT_BOUNDS, dashboardReducer, type DashboardState } from "./dashboard";

const base: DashboardState = {
  area: PILOT_BOUNDS,
  period: "ALL",
  scale: "harmonized",
  startYear: FIRST_YEAR,
  endYear: LAST_YEAR,
  months: [],
  selected: { year: 2010, month: 9 },
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
