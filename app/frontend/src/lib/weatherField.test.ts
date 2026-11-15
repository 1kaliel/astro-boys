import { describe, expect, it } from "vitest";
import type { LiveWindResponse, MonthFieldResponse } from "../data/api";
import { fieldFor, liveField, monthField } from "./weatherField";

const live = {
  step_deg: 3,
  model_time: "2026-11-15T10:00",
  ttl_seconds: 5400,
  stale: false,
  stale_reason: null,
  points: [{ lat: -5, lon: -39, temperature_c: 27, wind_speed_kmh: 19, wind_from_deg: 68, gust_kmh: 30 }],
} as unknown as LiveWindResponse;

const month = (year: number, m: number): MonthFieldResponse =>
  ({
    year,
    month: m,
    status: "ok",
    available_through: "2015-10-31",
    step_deg: 3,
    points: [
      {
        lat: -5,
        lon: -39,
        temperature_c: 25,
        wind_speed_kmh: 10,
        wind_from_deg: 90,
        wind_flow_kmh: 4,
        days_available: 31,
      },
    ],
  }) as unknown as MonthFieldResponse;

const NOW = { year: 2026, month: 11 };

describe("the weather field of the overview", () => {
  it("live: the streaks move at the wind speed and the period is a model time", () => {
    const field = liveField(live);
    expect(field.kind).toBe("live");
    expect(field.points[0].flow_kmh).toBe(19);
    expect(field.reference).toBe("2026-11-15 10:00 UTC");
    expect(field.windLabel).toBe("Latest available wind");
  });

  it("a month: the streaks move at the mean flow, not at the mean speed, and the period is the month", () => {
    const field = monthField(month(2015, 10));
    expect(field.kind).toBe("month");
    expect(field.points[0].wind_speed_kmh).toBe(10);
    expect(field.points[0].flow_kmh).toBe(4); // the mean vector is shorter than the mean speed
    expect(field.reference).toBe("Monthly mean of October 2015 (UTC days)");
    expect(field.windLabel).toBe("Historical wind");
    expect(field.model).toContain("ERA5");
  });

  it("the current month uses the live field, any other month uses ERA5", () => {
    expect(fieldFor(NOW, NOW, live, null)?.kind).toBe("live");
    expect(fieldFor({ year: 2015, month: 10 }, NOW, live, month(2015, 10))?.kind).toBe("month");
  });

  it("never shows the weather of one month under the label of another", () => {
    // The page keeps the last answer while a new one loads: here September 2015 is still in memory, October is picked.
    expect(fieldFor({ year: 2015, month: 10 }, NOW, live, month(2015, 9))).toBeNull();
    expect(fieldFor({ year: 2015, month: 10 }, NOW, live, null)).toBeNull();
  });

  it("never fills a past month with the live weather", () => {
    expect(fieldFor({ year: 2015, month: 10 }, NOW, live, null)).toBeNull(); // not the live field as a stand-in
  });

  it("without a month picked yet it shows the live field when there is one", () => {
    expect(fieldFor(null, NOW, live, null)?.kind).toBe("live");
    expect(fieldFor(null, NOW, null, null)).toBeNull();
  });
});
