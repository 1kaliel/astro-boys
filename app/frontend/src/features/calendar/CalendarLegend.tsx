import { anomalyColor, anomalyLegend } from "../../lib/charts";
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

/**
 * Legend of the anomaly mode: nine classes of the robust z-score, from far below to far above the median of that
 * month of the year. Blue is below and orange is above; the labels carry the numbers, so color is not alone.
 */
export function AnomalyLegend({ unit }: { unit: string }) {
  return (
    <div className="calendar-legend" aria-label="Legend">
      <p className="calendar-legend-title">{unit}</p>
      <ol className="calendar-legend-scale" aria-label="Robust z-score, by color">
        {anomalyLegend().map((item) => (
          <li key={item.step} className="calendar-legend-segment">
            <span className="calendar-legend-bar" style={{ background: anomalyColor(item.step) }} />
            <span className="calendar-legend-label">{item.label}</span>
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
      <p className="calendar-legend-note">
        Below the median is blue, above it is orange, and a month without a comparison is neutral. The z-score is robust
        (median and MAD of the baseline years); it is not a probability of fire.
      </p>
    </div>
  );
}

type CalendarKeyProps = {
  /** Count view: the colour ranges on screen. Anomaly view: the z-score classes. Empty when there is nothing to colour. */
  ranges: ReadonlyArray<LegendRange>;
  anomaly: boolean;
  unit: string;
};

/**
 * The key beside the calendar: what each colour means on this screen, and what each mark on a cell means (the dot,
 * the corner, the hatching, the outline). Written for someone who reads the chart cold.
 */
export function CalendarKey({ ranges, anomaly, unit }: CalendarKeyProps) {
  return (
    <section className="calendar-key" aria-label="How to read the calendar">
      <h3 className="calendar-key-title">How to read the colors</h3>
      <p className="calendar-key-unit">{unit}</p>
      {anomaly ? (
        <ul className="calendar-key-list" aria-label="Robust z-score, by color">
          {anomalyLegend().map((item) => (
            <li key={item.step}>
              <span className="calendar-key-swatch" style={{ background: anomalyColor(item.step) }} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      ) : (
        ranges.length > 0 && (
          <ul className="calendar-key-list" aria-label="Detections per month, by color">
            {ranges.map((range) => (
              <li key={`${range.step}-${range.from}`}>
                <span
                  className="calendar-key-swatch"
                  style={{ background: `var(--viz-seq-${range.step})` }}
                  aria-hidden="true"
                />
                {range.label}
              </li>
            ))}
          </ul>
        )
      )}
      <h4 className="calendar-key-subtitle">The marks on a month</h4>
      <ul className="calendar-key-list calendar-key-marks">
        {!anomaly && (
          <li>
            <span className="calendar-chip calendar-chip-zero" aria-hidden="true">
              0
            </span>
            <span>
              <strong>Zero</strong>: the sensors were observing and found no detection. A measured zero, not missing
              data; a day or month they were not observing is hatched instead.
            </span>
          </li>
        )}
        <li>
          <span className="calendar-chip calendar-chip-estimated" aria-hidden="true" />
          <span>
            <strong>The dot</strong>: estimated from MODIS. Before February 2012 the value is built from MODIS, with an
            interval, not observed by VIIRS.
          </span>
        </li>
        <li>
          <span className="calendar-chip calendar-chip-partial" aria-hidden="true" />
          <span>
            <strong>The cut corner</strong>: a partial month, so it is compared only with the same days of earlier years.
          </span>
        </li>
        <li>
          <span className="calendar-chip calendar-chip-nodata" aria-hidden="true" />
          <span>
            <strong>Hatched</strong>: no data for that month, or in the Skyline a day the sensor was not observing (an
            outage). It is not zero.
          </span>
        </li>
        <li>
          <span className="calendar-chip calendar-chip-selected" aria-hidden="true" />
          <span>
            <strong>Outlined</strong>: the month selected, which also drives the map.
          </span>
        </li>
      </ul>
    </section>
  );
}
