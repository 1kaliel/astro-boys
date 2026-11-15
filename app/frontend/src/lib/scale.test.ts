import { describe, expect, it } from "vitest";
import { classOf, drillBreaks, drillStep, drillStops, rampStep, sequentialEdges } from "./scale";

describe("scale", () => {
  const breaks = [2, 8.4, 15, 30, 47, 67]; // map breaks of the official mock (ALL)

  it("classes a value against fixed breaks", () => {
    expect(classOf(1.6, breaks)).toBe(1); // a uniform low-season month stays in the lowest class
    expect(classOf(2, breaks)).toBe(2);
    expect(classOf(156, breaks)).toBe(7);
    expect(classOf(null, breaks)).toBe(0);
  });

  it("spreads fewer classes over the whole ramp", () => {
    expect([1, 2, 3, 4].map((c) => rampStep(c, 4))).toEqual([1, 3, 5, 7]);
    expect([1, 2, 3, 4, 5, 6, 7].map((c) => rampStep(c, 7))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rampStep(1, 1)).toBe(7);
  });

  it("per-month equal bins collapse on a uniform month (the bug fixed by fixed breaks)", () => {
    const { edges } = sequentialEdges(Array(3990).fill(1.6));
    expect(classOf(1.6, edges)).toBe(7); // every cell would get the strongest color
  });
});

describe("drill-down classes (native counts of at most 16 L3 cells)", () => {
  it("splits min..max into at most 4 equal whole-number steps", () => {
    const counts = Array.from({ length: 16 }, (_, i) => (i + 1) * 6); // 6 … 96
    expect(drillBreaks(counts)).toEqual([29, 51, 74]);
    expect(drillStops(counts, drillBreaks(counts))).toEqual([
      { step: 1, from: 6, to: 28 },
      { step: 3, from: 29, to: 50 },
      { step: 5, from: 51, to: 73 },
      { step: 7, from: 74, to: 96 },
    ]);
  });

  it("never makes more classes than distinct counts, and is deterministic", () => {
    expect(drillBreaks([1, 2])).toEqual([2]);
    expect(drillBreaks([2, 1, 2, 1])).toEqual([2]);
    expect(drillBreaks([3, 1, 7])).toEqual([3, 5]);
    expect(drillBreaks([7, 3, 1])).toEqual(drillBreaks([1, 3, 7]));
  });

  it("has a single class, on the middle step, when every count is the same, and none without counts", () => {
    expect(drillBreaks([5, 5, 5])).toEqual([]);
    expect(drillStep(5, [])).toBe(4);
    expect(drillStops([5, 5], [])).toEqual([{ step: 4, from: 5, to: 5 }]);
    expect(drillBreaks([])).toEqual([]);
    expect(drillBreaks([0, 0])).toEqual([]);
    expect(drillStops([], [])).toEqual([]);
  });

  it("puts every count in the class whose range holds it, the top count in the darkest step", () => {
    const counts = [1, 2, 3, 10, 40];
    const breaks = drillBreaks(counts);
    for (const stop of drillStops(counts, breaks)) {
      expect(drillStep(stop.from, breaks)).toBe(stop.step);
      expect(drillStep(stop.to, breaks)).toBe(stop.step);
    }
    expect(drillStep(40, breaks)).toBe(7);
  });
});
