import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  barHeight,
  buildGrid,
  camera,
  computeStats,
  dayMs,
  levelOf,
  markOf,
  project,
  readDay,
  toKey,
} from "./skyline";

const END = Date.UTC(2016, 10, 8); // a Tuesday

describe("skyline grid", () => {
  it("ends on the last day, starts on a whole week, and covers 365 days or more", () => {
    const g = buildGrid([], END);
    expect(g.cells[g.cells.length - 1].date).toBe("2016-11-08");
    expect(g.cells[0].day).toBe(0);
    expect(g.cells.length).toBeGreaterThanOrEqual(365);
    expect(g.weeks).toBe(g.cells[g.cells.length - 1].week + 1);
  });

  it("adds up repeated dates and ignores bad entries instead of inventing counts", () => {
    const g = buildGrid(
      [
        { date: "2016-11-01", count: 2 },
        { date: "2016-11-01", count: 3 },
        { date: "not a date", count: 9 },
        { date: "2016-11-02", count: Number.NaN },
        { date: "2016-11-03", count: -4 },
      ],
      END,
    );
    const day = g.cells.find((c) => c.date === "2016-11-01");
    expect(day?.count).toBe(5);
    expect(g.cells.find((c) => c.date === "2016-11-02")?.count).toBe(0);
    expect(g.cells.reduce((s, c) => s + c.count, 0)).toBe(5);
  });
});

describe("levels", () => {
  it("zero is level 0, and busy days split into four quarters of the busy level", () => {
    expect(levelOf(0, 40)).toBe(0);
    expect(levelOf(1, 40)).toBe(1);
    expect(levelOf(15, 40)).toBe(2);
    expect(levelOf(25, 40)).toBe(3);
    expect(levelOf(40, 40)).toBe(4);
    expect(levelOf(900, 40)).toBe(4);
  });

  it("one freak day does not wash every other day out (busy is the 95th percentile)", () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ date: toKey(END - i * DAY_MS), count: 10 }));
    data.push({ date: toKey(END), count: 100000 });
    const g = buildGrid(data, END);
    const ordinary = g.cells.find((c) => c.date === toKey(END - DAY_MS));
    expect(ordinary?.level).toBe(4); // 10 is at the busy level, not a sliver of it
  });
});

describe("statistics", () => {
  it("total, busiest day, longest run and the run that reaches the last day", () => {
    const data = [
      { date: "2016-10-01", count: 4 },
      { date: "2016-10-02", count: 1 },
      { date: "2016-10-03", count: 1 },
      { date: "2016-11-06", count: 9 },
      { date: "2016-11-07", count: 2 },
    ];
    const s = computeStats(buildGrid(data, END).cells);
    expect(s.total).toBe(17);
    expect(s.busiest).toEqual({ count: 9, date: "2016-11-06" });
    expect(s.longest).toEqual({ days: 3, start: "2016-10-01", end: "2016-10-03" });
    expect(s.current.days).toBe(2); // ends on 2016-11-07, the day before the last, which is 2016-11-08 with no count
  });

  it("an empty period has zero totals and no streaks", () => {
    const s = computeStats(buildGrid([], END).cells);
    expect(s.total).toBe(0);
    expect(s.longest.days).toBe(0);
    expect(s.current.days).toBe(0);
  });
});

describe("heights and the camera", () => {
  it("empty days stay thin slabs and the busiest day is the tallest", () => {
    expect(barHeight(0, 50)).toBeCloseTo(0.2);
    expect(barHeight(50, 50)).toBeGreaterThan(barHeight(10, 50));
  });

  it("the projection is linear: the same step gives the same length anywhere in the grid (no perspective)", () => {
    const c = camera(1);
    const a = project(c, 0, 0, 0);
    const b = project(c, 1, 0, 0);
    const far = project(c, 40, 0, 0);
    const farNext = project(c, 41, 0, 0);
    const len = (p: number[], q: number[]) => Math.hypot(q[0] - p[0], q[1] - p[1]);
    expect(len(far, farNext)).toBeCloseTo(len(a, b), 9);
  });

  it("the flat view looks straight down: height is invisible", () => {
    const c = camera(0);
    expect(project(c, 3, 2, 0)[1]).toBeCloseTo(project(c, 3, 2, 5)[1], 9);
  });

  it("parses dates without timezone drift", () => {
    expect(dayMs("2016-11-08")).toBe(Date.UTC(2016, 10, 8));
    expect(Number.isNaN(dayMs("nope"))).toBe(true);
  });
});

describe("days the sensor was not observing", () => {
  const YEAR_END = Date.UTC(2022, 11, 31);
  const YEAR_START = Date.UTC(2022, 0, 1);
  // The S-NPP outage of 2022 (coverage_daily: 27 July to 10 August, 15 days), around a run of busy days.
  const outage = Array.from({ length: 15 }, (_, i) => ({
    date: toKey(Date.UTC(2022, 6, 27) + i * DAY_MS),
    status: "missing" as const,
  }));
  const busy = Array.from({ length: 40 }, (_, i) => ({ date: toKey(Date.UTC(2022, 6, 7) + i * DAY_MS), count: 5 }));
  const grid = () => buildGrid(busy, YEAR_END, 0, { startMs: YEAR_START, missing: outage });

  it("marks them as no data: no count, no level, a hatched tile and not a zero slab", () => {
    const g = grid();
    const day = g.cells.find((c) => c.date === "2022-08-01");
    expect(day).toMatchObject({ status: "nodata", reason: "missing", count: 0, level: 0 });
    expect(markOf(day!, g.max)).toEqual({ kind: "nodata" });
    const zero = g.cells.find((c) => c.date === "2022-03-01")!;
    expect(zero.status).toBe("observed");
    expect(markOf(zero, g.max)).toEqual({ kind: "bar", height: barHeight(0, g.max), level: 0 });
  });

  it("a count given for a no-data day is never drawn or counted", () => {
    const g = grid(); // busy has 5 detections on every outage day too
    const s = computeStats(g.cells);
    expect(s.total).toBe(25 * 5); // 40 busy days minus the 15 outage days
    expect(s.noData).toBe(15);
  });

  it("they end a run instead of joining two runs or counting as zero days", () => {
    const s = computeStats(grid().cells);
    expect(s.longest).toEqual({ days: 20, start: "2022-07-07", end: "2022-07-26" });
  });

  it("they take no part in the level thresholds", () => {
    const data = [
      { date: "2022-05-01", count: 10 },
      { date: "2022-05-02", count: 1000 },
    ];
    const withGap = buildGrid(data, YEAR_END, 0, {
      startMs: YEAR_START,
      missing: [{ date: "2022-05-02", status: "missing" }],
    });
    expect(withGap.max).toBe(10);
    expect(withGap.cells.find((c) => c.date === "2022-05-01")?.level).toBe(4);
  });

  it("not operating is no data too, and the readings say why", () => {
    const g = buildGrid([], YEAR_END, 0, {
      startMs: YEAR_START,
      missing: [
        { date: "2022-01-02", status: "not_operating" },
        { date: "2022-01-03", status: "missing" },
      ],
    });
    const opts = { unit: "hotspot detection", plural: "hotspot detections", sensor: "VIIRS S-NPP", format: String };
    const at = (d: string) => readDay(g.cells.find((c) => c.date === d)!, opts);
    expect(at("2022-01-02")).toBe("No data: VIIRS S-NPP was not operating");
    expect(at("2022-01-03")).toBe("No data: VIIRS S-NPP was not observing (outage)");
    expect(at("2022-01-04")).toBe("No hotspot detections (a measured zero)");
  });

  it("when the coverage could not be checked, a day without detections is not a verified zero", () => {
    const g = buildGrid([{ date: "2022-06-01", count: 3 }], YEAR_END, 0, {
      startMs: YEAR_START,
      coverageChecked: false,
    });
    expect(g.cells.find((c) => c.date === "2022-06-01")).toMatchObject({ status: "observed", count: 3 });
    const empty = g.cells.find((c) => c.date === "2022-06-02")!;
    expect(empty).toMatchObject({ status: "nodata", reason: "unverified" });
    expect(computeStats(g.cells)).toMatchObject({ total: 3, noData: 364 });
  });

  it("the days before the first day asked for are not drawn and not counted", () => {
    const g = grid();
    expect(g.cells[0].date).toBe("2021-12-26"); // the Sunday of the week of 1 January 2022
    expect(g.cells.slice(0, 6).every((c) => c.status === "outside")).toBe(true);
    expect(markOf(g.cells[0], g.max)).toEqual({ kind: "none" });
    const s = computeStats(g.cells);
    expect(s.first).toBe("2022-01-01");
    expect(s.noData).toBe(15);
  });

  it("a run cannot reach the last day across a day with no data", () => {
    const data = [
      { date: "2022-12-29", count: 1 },
      { date: "2022-12-30", count: 1 },
      { date: "2022-12-31", count: 1 },
    ];
    const g = buildGrid(data, YEAR_END, 0, {
      startMs: YEAR_START,
      missing: [{ date: "2022-12-31", status: "missing" }],
    });
    expect(computeStats(g.cells).current.days).toBe(0);
  });
});
