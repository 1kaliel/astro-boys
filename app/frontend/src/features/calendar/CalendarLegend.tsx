import { formatCount } from "../../lib/format";
import type { LegendRange } from "./calendarModel";

type CalendarLegendProps = {
  /** The colors in use, each with the range of detections it covers. Empty when every month shown is zero. */
  ranges: ReadonlyArray<LegendRange>;
  unit: string;
};

/**
 * Horizontal legend under the grid. The labels are ranges of hotspot detections per month (what the colors mean on
 * this screen), followed by the states of a month that are not a plain count: zero, estimated, partial, no data and
 * the selected month. Each state has its own look, so none depends on color alone.
 */
export function CalendarLegend({ ranges, unit }: CalendarLegendProps) {
  return (
    <div className="calendar-legend" aria-label="Legend">
      <p className="calendar-legend-title">{unit}</p>
      {ranges.length > 0 && (
        <ol className="calendar-legend-scale" aria-label="Detections per month, by color">
          {ranges.map((range) => (
            <li
              key={`${range.step}-${range.from}`}
              className="calendar-legend-segment"
              title={`From ${formatCount(range.from)} up to ${range.includesTo ? "and including " : "but not including "}${formatCount(range.to)}`}
            >
              <span className="calendar-legend-bar" style={{ background: `var(--viz-seq-${range.step})` }} />
              <span className="calendar-legend-label">{range.label}</span>
            </li>
          ))}
        </ol>
      )}
      <ul className="calendar-legend-states">
        <li>
          <span className="calendar-chip calendar-chip-zero" aria-hidden="true">
            0
          </span>
          Zero detections
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
      <p className="calendar-legend-note">
        Each color holds about the same number of months, so the ranges are not evenly spaced. They are recomputed for the
        months on screen.
      </p>
    </div>
  );
}
