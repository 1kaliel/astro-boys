import { describe, expect, it } from "vitest";
import { DAY_MS, barHeight, buildGrid, camera, computeStats, dayMs, levelOf, project, toKey } from "./skyline";

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
