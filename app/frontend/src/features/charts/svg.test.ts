import { describe, expect, it } from "vitest";
import { BASELINE_Y, CHART, INNER_HEIGHT, INNER_WIDTH, bandPath, linePath, xOf, yOf } from "./svg";

describe("chart geometry", () => {
  it("puts zero on the baseline and the maximum at the top", () => {
    expect(yOf(0, 100)).toBe(BASELINE_Y);
    expect(yOf(100, 100)).toBe(BASELINE_Y - INNER_HEIGHT);
    expect(yOf(5, 0)).toBe(BASELINE_Y); // an empty axis does not divide by zero
  });

  it("spreads steps from the left edge to the right edge, and centers a single step", () => {
    expect(xOf(0, 12)).toBe(CHART.left);
    expect(xOf(11, 12)).toBe(CHART.left + INNER_WIDTH);
    expect(xOf(0, 1)).toBe(CHART.left + INNER_WIDTH / 2);
  });

  it("breaks the line at a gap instead of bridging it", () => {
    const path = linePath([{ x: 0, y: 0 }, { x: 10, y: 5 }, null, { x: 30, y: 1 }, { x: 40, y: 2 }]);

    expect(path).toBe("M0.0,0.0L10.0,5.0M30.0,1.0L40.0,2.0");
    expect(linePath([null, null])).toBe("");
  });

  it("closes the band between the upper and the lower line", () => {
    const upper = [{ x: 0, y: 1 }, { x: 10, y: 2 }];
    const lower = [{ x: 0, y: 5 }, { x: 10, y: 6 }];

    expect(bandPath(upper, lower)).toBe("M0.0,1.0L10.0,2.0L10.0,6.0L0.0,5.0Z");
    expect(bandPath([{ x: 0, y: 1 }], [{ x: 0, y: 5 }])).toBe("");
  });
});
