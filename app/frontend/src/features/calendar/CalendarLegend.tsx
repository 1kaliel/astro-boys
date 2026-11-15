import { anomalyColor, anomalyLegend } from "../../lib/charts";
import { formatCount } from "../../lib/format";
import type { LegendRange } from "./calendarModel";

/** The legend doubles as the color filter: a segment is a toggle, pressed = the color is shown. */
type LegendFilter = {
  /** Color classes switched off ("zero", "seq-N", "div-N"). */
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onReset: () => void;
};

function ResetColors({ hidden, onReset }: Pick<LegendFilter, "hidden" | "onReset">) {
  if (hidden.size === 0) return null;
  return (
    <p className="calendar-legend-filter" role="status">
      {hidden.size === 1 ? "1 color hidden" : `${hidden.size} colors hidden`}.{" "}
      <button type="button" className="calendar-legend-reset" onClick={onReset}>
        Show all colors
      </button>
    </p>
  );
}

type CalendarLegendProps = LegendFilter & {
  /** The colors in use, each with the range of detections it covers. Empty when every month shown is zero. */
  ranges: ReadonlyArray<LegendRange>;
  unit: string;
};

/**
 * Horizontal legend under the grid. The labels are ranges of hotspot detections per month (what the colors mean on
 * this screen), followed by the states of a month that are not a plain count: zero, estimated, partial, no data and
 * the selected month. Each state has its own look, so none depends on color alone.
 */
export function CalendarLegend({ ranges, unit, hidden, onToggle, onReset }: CalendarLegendProps) {
  return (
    <div className="calendar-legend" aria-label="Legend">
      <p className="calendar-legend-title">{unit}</p>
      {ranges.length > 0 && (
        <ol className="calendar-legend-scale" aria-label="Detections per month, by color">
          {ranges.map((range) => (
            <li key={`${range.step}-${range.from}`} className="calendar-legend-segment">
              <button
                type="button"
                className="calendar-legend-toggle"
                aria-pressed={!hidden.has(`seq-${range.step}`)}
                aria-label={`${range.label} detections per month`}
                title={`From ${formatCount(range.from)} up to ${range.includesTo ? "and including " : "but not including "}${formatCount(range.to)}. Click to ${hidden.has(`seq-${range.step}`) ? "show" : "hide"} these months.`}
                onClick={() => onToggle(`seq-${range.step}`)}
              >
                <span className="calendar-legend-bar" style={{ background: `var(--viz-seq-${range.step})` }} />
                <span className="calendar-legend-label">{range.label}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <ul className="calendar-legend-states">
        <li>
          <button
            type="button"
            className="calendar-legend-toggle calendar-legend-toggle-inline"
            aria-pressed={!hidden.has("zero")}
            title={`Click to ${hidden.has("zero") ? "show" : "hide"} months with zero detections.`}
            onClick={() => onToggle("zero")}
          >
            <span className="calendar-chip calendar-chip-zero" aria-hidden="true">
              0
            </span>
            Zero detections
          </button>
        </li>
        <li>
          <span className="calendar-chip calendar-chip-estimated" aria-hidden="true" />
          Estimated from MODIS
        </li>
        <li>
          <span className="calendar-chip calendar-chip-partial" aria-hidden="true" />
          Partial month
        </li>
        <li>
          <span className="calendar-chip calendar-chip-nodata" aria-hidden="true" />
          No data
        </li>
        <li>
          <span className="calendar-chip calendar-chip-selected" aria-hidden="true" />
          Selected month
        </li>
      </ul>
      <ResetColors hidden={hidden} onReset={onReset} />
      <p className="calendar-legend-note">
        Click a color to hide or show its months.
      </p>
    </div>
  );
}

/**
 * Legend of the anomaly mode: nine classes of the robust z-score, from far below to far above the median of that
 * month of the year. Blue is below and orange is above; the labels carry the numbers, so color is not alone.
 */
export function AnomalyLegend({ unit, hidden, onToggle, onReset }: { unit: string } & LegendFilter) {
  return (
    <div className="calendar-legend" aria-label="Legend">
      <p className="calendar-legend-title">{unit}</p>
      <ol className="calendar-legend-scale" aria-label="Robust z-score, by color">
        {anomalyLegend().map((item) => (
          <li key={item.step} className="calendar-legend-segment">
            <button
              type="button"
              className="calendar-legend-toggle"
              aria-pressed={!hidden.has(`div-${item.step}`)}
              aria-label={`Robust z-score ${item.label}`}
              title={`Click to ${hidden.has(`div-${item.step}`) ? "show" : "hide"} these months.`}
              onClick={() => onToggle(`div-${item.step}`)}
            >
              <span className="calendar-legend-bar" style={{ background: anomalyColor(item.step) }} />
              <span className="calendar-legend-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <ul className="calendar-legend-states">
        <li>
          <span className="calendar-chip calendar-chip-estimated" aria-hidden="true" />
          Estimated from MODIS
        </li>
        <li>
          <span className="calendar-chip calendar-chip-partial" aria-hidden="true" />
          Partial month
        </li>
        <li>
          <span className="calendar-chip calendar-chip-nodata" aria-hidden="true" />
          No data
        </li>
        <li>
          <span className="calendar-chip calendar-chip-selected" aria-hidden="true" />
          Selected month
        </li>
      </ul>
      <ResetColors hidden={hidden} onReset={onReset} />
      <p className="calendar-legend-note">
        Click a color to hide or show its months. Blue is below the median, orange above it, neutral has no comparison.
      </p>
    </div>
  );
}
