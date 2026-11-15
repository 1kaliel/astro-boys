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
