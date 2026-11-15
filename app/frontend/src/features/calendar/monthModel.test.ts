import { describe, expect, it } from "vitest";
import type { DailyDay } from "../../data/daily";
import {
  buildMonthGrid,
  dailyErrorText,
  dayAriaLabel,
  dayCountText,
  dayFill,
  dayItems,
  dayLong,
  dayScale,
  daysInMonth,
  isEstimatedEra,
  monthBounds,
  moveDay,
  nativeTotal,
  satelliteForSensor,
  shiftMonth,
  sourceLabel,
  timeRange,
  weekdayMondayFirst,
} from "./monthModel";
import type { CalendarMonth } from "../../data/calendarSource";

function observed(date: string, count: number): DailyDay {
  return { date, status: "observed", count, passes: [] };
}

describe("month grid", () => {
  it("knows month lengths and leap years", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 12)).toBe(31);
  });

  it("counts weekdays Monday first", () => {
    expect(weekdayMondayFirst(2025, 9, 1)).toBe(0); // Monday
    expect(weekdayMondayFirst(2025, 9, 7)).toBe(6); // Sunday
    expect(weekdayMondayFirst(2026, 11, 1)).toBe(6); // Sunday
  });

  it("pads with leading blanks and fills whole weeks", () => {
    const cells = buildMonthGrid(2026, 11, [], null); // starts on a Sunday
    expect(cells.slice(0, 6).every((c) => c.kind === "blank")).toBe(true);
    expect(cells[6]).toMatchObject({ kind: "day", day: 1, date: "2026-11-01" });
    expect(cells.length % 7).toBe(0);
    expect(dayItems(cells)).toHaveLength(30);
  });

  it("marks days after the last date as no data, keeps observed zeros", () => {
    const days = [observed("2026-11-01", 0), observed("2026-11-02", 5), observed("2026-11-20", 9)];
    const cells = dayItems(buildMonthGrid(2026, 11, days, "2026-11-14"));
    expect(cells[0]).toMatchObject({ status: "observed", count: 0 });
    expect(cells[1]).toMatchObject({ status: "observed", count: 5 });
    expect(cells[2]).toMatchObject({ status: "no_data", count: null }); // missing from the answer
    expect(cells[13].isLatest).toBe(true);
    expect(cells[19]).toMatchObject({ status: "no_data", count: null }); // after last_date
  });

  it("colors by a per-month scale, zero and no data apart", () => {
    const days = Array.from({ length: 10 }, (_, i) => observed(`2025-09-${String(i + 1).padStart(2, "0")}`, i * 10));
    const cells = buildMonthGrid(2025, 9, days, "2025-09-30");
    const scale = dayScale(cells);
    const items = dayItems(cells);
    expect(dayFill(items[0], scale)).toBe("zero");
    expect(dayFill(items[9], scale)).toBe(7);
    expect(dayFill(items[1], scale)).toBe(1);
    expect(dayFill(items[20], scale)).toBe("nodata");
    expect(nativeTotal(cells)).toBe(450);
  });

  it("moves the keyboard focus by day and week, clamped to the month", () => {
    expect(moveDay(1, "ArrowLeft", 30, 0)).toBe(1);
    expect(moveDay(5, "ArrowDown", 30, 4)).toBe(12);
    expect(moveDay(28, "ArrowDown", 30, 4)).toBe(30);
    expect(moveDay(10, "Home", 30, 2)).toBe(8);
    expect(moveDay(10, "End", 30, 2)).toBe(14);
    expect(moveDay(10, "a", 30, 2)).toBeNull();
  });
});

describe("months", () => {
  it("shifts over the year end", () => {
    expect(shiftMonth({ year: 2025, month: 12 }, 1)).toEqual({ year: 2026, month: 1 });
    expect(shiftMonth({ year: 2025, month: 1 }, -1)).toEqual({ year: 2024, month: 12 });
  });

  it("knows the MODIS era", () => {
    expect(isEstimatedEra({ year: 2012, month: 1 })).toBe(true);
    expect(isEstimatedEra({ year: 2012, month: 2 })).toBe(false);
  });

  it("finds the first and last month of the calendar", () => {
    const m = (year: number, month: number) => ({ year, month }) as CalendarMonth;
    expect(monthBounds([m(2010, 5), m(2002, 7), m(2026, 11)])).toEqual({
      first: { year: 2002, month: 7 },
      last: { year: 2026, month: 11 },
    });
    expect(monthBounds([])).toBeNull();
  });
});

describe("words", () => {
  it("labels native detections, never fires", () => {
    expect(sourceLabel({ satellite: "SNPP", instrument: "VIIRS" })).toBe(
      "Native detections · S-NPP VIIRS · not harmonized",
    );
    expect(sourceLabel({ satellite: "Aqua", instrument: "MODIS" })).toContain("Aqua MODIS");
    expect(sourceLabel({ satellite: "X9", instrument: "VIIRS" })).toContain("X9 VIIRS");
  });

  it("says no detection, not no fire, and no data yet", () => {
    expect(dayCountText({ status: "observed", count: 0 })).toBe("No detection");
    expect(dayCountText({ status: "observed", count: 1 })).toBe("1 native detection");
    expect(dayCountText({ status: "observed", count: 1234 })).toBe("1,234 native detections");
    expect(dayCountText({ status: "no_data", count: null })).toBe("No data yet");
  });

  it("writes full dates and labels", () => {
    expect(dayLong("2025-09-03")).toBe("Wednesday, 3 September 2025");
    const [cell] = dayItems(buildMonthGrid(2025, 9, [observed("2025-09-01", 0)], "2025-09-01"));
    expect(dayAriaLabel(cell, "S-NPP VIIRS")).toBe(
      "Monday, 1 September 2025: No detection. S-NPP VIIRS, not harmonized. No detection does not mean no fire. Latest data.",
    );
  });

  it("words errors for users", () => {
    expect(dailyErrorText("Not Found").missing).toBe(true);
    expect(dailyErrorText("Request failed (404)").text).toBe("Daily details are not available on this server yet.");
    expect(dailyErrorText("Detections unreadable").missing).toBe(false);
  });

  it("maps layers to satellites and writes time ranges", () => {
    expect(satelliteForSensor("harmonized")).toBeUndefined();
    expect(satelliteForSensor("n20")).toBe("N20");
    expect(timeRange("13:05", "13:12")).toBe("13:05–13:12");
    expect(timeRange("13:05", "13:05")).toBe("13:05");
  });
});
