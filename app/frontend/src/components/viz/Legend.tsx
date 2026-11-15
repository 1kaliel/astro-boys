type LegendProps = {
  mode: "sequential" | "diverging";
  /** Shown at the ends of the ramp, e.g. "0" and "1,240" (sequential) — ignored for diverging. */
  minLabel?: string;
  maxLabel?: string;
  /** e.g. "VIIRS-equivalent hotspots per month" */
  unit: string;
  /** Show the provenance marks (estimated, partial month, no data). */
  showMarking?: boolean;
};

const SEQ_STEPS = [1, 2, 3, 4, 5, 6, 7];
const DIV_STEPS = ["neg-4", "neg-3", "neg-2", "neg-1", "mid", "pos-1", "pos-2", "pos-3", "pos-4"];

export function Legend({ mode, minLabel, maxLabel, unit, showMarking = true }: LegendProps) {
  return (
    <div className="legend" aria-label="Legend">
      <div className="legend-row">
        {mode === "sequential" ? (
          <>
            <span className="legend-end">{minLabel ?? "Less"}</span>
            <span className="legend-ramp" aria-hidden="true">
              {SEQ_STEPS.map((step) => (
                <span key={step} className="legend-step" style={{ background: `var(--viz-seq-${step})` }} />
              ))}
            </span>
            <span className="legend-end">{maxLabel ?? "More"}</span>
          </>
        ) : (
          <>
            <span className="legend-end">Below median</span>
            <span className="legend-ramp" aria-hidden="true">
              {DIV_STEPS.map((step) => (
                <span
                  key={step}
                  className="legend-step"
                  style={{ background: step === "mid" ? "var(--viz-div-mid)" : `var(--viz-div-${step})` }}
                />
              ))}
            </span>
            <span className="legend-end">Above median</span>
          </>
        )}
        <span className="legend-unit">{unit}</span>
      </div>
      {showMarking && (
        <ul className="legend-marks">
          <li>
            <span className="legend-mark legend-mark-observed" aria-hidden="true" /> Observed by VIIRS
          </li>
          <li>
            <span className="legend-mark legend-mark-estimated" aria-hidden="true" /> Estimated from MODIS
          </li>
          <li>
            <span className="legend-mark legend-mark-partial" aria-hidden="true" /> Partial month
          </li>
          <li>
            <span className="legend-mark legend-mark-null" aria-hidden="true" /> No data
          </li>
        </ul>
      )}
      {mode === "diverging" && (
        <p className="legend-note">Robust z-score bands are a product choice, not a NASA threshold and not a probability.</p>
      )}
    </div>
  );
}
