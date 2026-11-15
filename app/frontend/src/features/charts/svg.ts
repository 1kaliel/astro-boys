/** Geometry shared by the line charts: one fixed drawing size, scaled by the SVG viewBox. */
export const CHART = { width: 640, height: 280, top: 16, right: 16, bottom: 34, left: 54 } as const;
export const INNER_WIDTH = CHART.width - CHART.left - CHART.right;
export const INNER_HEIGHT = CHART.height - CHART.top - CHART.bottom;
export const BASELINE_Y = CHART.top + INNER_HEIGHT;

export type Point = { x: number; y: number };

/** Vertical position of a value on an axis from 0 to `max`. */
export function yOf(value: number, max: number): number {
  return BASELINE_Y - (max > 0 ? value / max : 0) * INNER_HEIGHT;
}

/** Horizontal position of step `index` out of `count` evenly spaced steps (a single step sits in the middle). */
export function xOf(index: number, count: number): number {
  return count > 1 ? CHART.left + (index / (count - 1)) * INNER_WIDTH : CHART.left + INNER_WIDTH / 2;
}

/** SVG path through the points; a null breaks the line (a gap in the data is never bridged). */
export function linePath(points: ReadonlyArray<Point | null>): string {
  let path = "";
  let penDown = false;
  for (const point of points) {
    if (!point) {
      penDown = false;
      continue;
    }
    path += `${penDown ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    penDown = true;
  }
  return path;
}

/** Closed SVG path between an upper and a lower line over the same x positions (the p10 to p90 band). */
export function bandPath(upper: ReadonlyArray<Point>, lower: ReadonlyArray<Point>): string {
  if (upper.length < 2 || upper.length !== lower.length) return "";
  const forward = upper.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
  const back = [...lower].reverse().map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
  return `${forward}${back}Z`;
}
