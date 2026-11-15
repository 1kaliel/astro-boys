import { Fragment } from "react";
import { formatCount, formatLegendCount } from "../../lib/format";
import "../../styles/legend-direction.css";
import { rampStep } from "../../lib/scale";

type LegendProps = {
  mode: "sequential" | "diverging";
  /** Shown at the ends of the ramp, e.g. "0" and "113K+" (sequential). */
  minLabel?: string;
  maxLabel?: string;
  /** Class limits (map): the legend shows each limit between its two colors instead of min and max. */
  breaks?: readonly number[];
  /** Sequential only: the colors actually used, each with where it starts (e.g. "≥ 4,400"). */
  stops?: ReadonlyArray<{ step: number; label: string }>;
  /** e.g. "VIIRS-equivalent hotspots per month" */
  unit: string;
  /** Show the calendar marks (sensor change line, partial month, no data). */
  showMarking?: boolean;
  /** One line that says how the colors were split, so the scale is never a secret. */
  note?: string;
};

const SEQ_STEPS = [1, 2, 3, 4, 5, 6, 7];

/**
 * A class limit of counts, as a whole number: hotspots are counted, so "2.6" reads wrong. Only the label is rounded;
 * the breaks themselves (and so the colors) are untouched. The last limit gets "+" (its color is "that many or more").
 */
export function legendBreakLabel(edge: number, last: boolean): string {
  const whole = Math.round(edge);
  const text = Math.abs(whole) >= 10_000 ? formatLegendCount(whole) : formatCount(whole);
  return last ? `${text}+` : text;
}
const DIV_STEPS = ["neg-4", "neg-3", "neg-2", "neg-1", "mid", "pos-1", "pos-2", "pos-3", "pos-4"];

export function Legend({ mode, minLabel, maxLabel, breaks, unit, showMarking = true, stops, note }: LegendProps) {
  return (
    <div className="legend" aria-label="Legend">
      <div className="legend-row">
        {mode === "sequential" && stops ? (
          <ol className="legend-stops" aria-label="Color scale: each color starts at">
            {stops.map((stop) => (
              <li key={stop.step} className="legend-stop">
                <span className="legend-step" style={{ background: `var(--viz-seq-${stop.step})` }} />
                <span className="legend-stop-label">{stop.label}</span>
              </li>
            ))}
          </ol>
        ) : mode === "sequential" && breaks && breaks.length > 0 ? (
          <span className="legend-classes" aria-label="Color scale, fewer to more">
            <span className="legend-end legend-dir">Fewer</span>
            {[...breaks, null].map((edge, i) => (
              <Fragment key={i}>
                <span
                  className="legend-step"
                  aria-hidden="true"
                  style={{ background: `var(--viz-seq-${rampStep(i + 1, breaks.length + 1)})` }}
                />
                {edge !== null && <span className="legend-break">{legendBreakLabel(edge, i === breaks.length - 1)}</span>}
              </Fragment>
            ))}
            <span className="legend-end legend-dir">More</span>
          </span>
        ) : mode === "sequential" ? (
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
            <span className="legend-mark legend-mark-boundary" aria-hidden="true" /> Sensor change, February 2012:
            months before it are estimated from MODIS, months after it are observed by VIIRS
          </li>
          <li>
            <span className="legend-mark legend-mark-partial" aria-hidden="true" /> Partial month
          </li>
          <li>
            <span className="legend-mark legend-mark-null" aria-hidden="true" /> No data
          </li>
        </ul>
      )}
      {note && <p className="legend-note">{note}</p>}
      {mode === "diverging" && (
        <p className="legend-note">Robust z-score bands are a product choice, not a NASA threshold and not a probability.</p>
      )}
    </div>
  );
}
