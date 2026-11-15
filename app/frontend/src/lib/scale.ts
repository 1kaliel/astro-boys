/** Sequential binning for the 7-step ramp (--viz-seq-1 … --viz-seq-7). */
export const SEQ_STEPS = 7;

export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Class of a value against ascending breaks: 1 … breaks.length + 1; 0 when there is no value. */
export function classOf(value: number | null | undefined, breaks: readonly number[]): number {
  if (value == null) return 0;
  return 1 + breaks.filter((edge) => value >= edge).length;
}

/**
 * Ramp step (1…7) for a class, spreading fewer classes over the whole ramp so the top class is always the
 * strongest step (e.g. 4 classes use steps 1, 3, 5, 7).
 */
export function rampStep(cls: number, classes: number): number {
  if (cls <= 0) return 0;
  if (classes <= 1) return SEQ_STEPS;
  return 1 + Math.round(((cls - 1) * (SEQ_STEPS - 1)) / (classes - 1));
}

/**
 * Six strictly increasing edges splitting 0…p95 into 7 equal bins. Values at or above the last edge use the
 * darkest step, so one extreme cell does not wash out the rest of the map.
 */
export function sequentialEdges(values: readonly number[]): { edges: number[]; top: number } {
  const top = Math.max(quantile(values.filter((v) => v > 0), 0.95), 1);
  const edges = Array.from({ length: SEQ_STEPS - 1 }, (_, i) => (top * (i + 1)) / SEQ_STEPS);
  return { edges, top };
}

/** At most this many classes for the 16 sub-cells of a drill-down: more would split a handful of values. */
export const DRILL_CLASSES = 4;

/**
 * Class limits for the native counts of one drill-down (at most 16 L3 cells): equal steps from the lowest to the
 * highest positive count, whole numbers, strictly increasing, at most DRILL_CLASSES classes and never more classes
 * than distinct counts. Deterministic, and printed in the legend. Empty when every count is the same.
 */
export function drillBreaks(counts: readonly number[]): number[] {
  const positive = counts.filter((c) => c > 0);
  if (positive.length === 0) return [];
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  const classes = Math.min(DRILL_CLASSES, new Set(positive).size);
  const edges: number[] = [];
  for (let i = 1; i < classes; i++) {
    const edge = Math.ceil(min + ((max - min) * i) / classes);
    if (edge > min && edge <= max && edge > (edges[edges.length - 1] ?? -Infinity)) edges.push(edge);
  }
  return edges;
}

/** Ramp step (1…7) of a drill-down count. A single class takes the middle step, not the darkest. */
export function drillStep(count: number, breaks: readonly number[]): number {
  const classes = breaks.length + 1;
  return classes === 1 ? Math.ceil(SEQ_STEPS / 2) : rampStep(classOf(count, breaks), classes);
}

/** Legend entries of a drill-down: each color with the whole-number range of counts it holds ("1–3", "4–6"…). */
export function drillStops(counts: readonly number[], breaks: readonly number[]): Array<{ step: number; from: number; to: number }> {
  const positive = counts.filter((c) => c > 0);
  if (positive.length === 0) return [];
  const lows = [Math.min(...positive), ...breaks];
  const max = Math.max(...positive);
  return lows.map((from, i) => ({ step: drillStep(from, breaks), from, to: i < breaks.length ? breaks[i] - 1 : max }));
}
