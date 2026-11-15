import { describe, expect, it } from "vitest";
import { classOf, rampStep, sequentialEdges } from "./scale";

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
