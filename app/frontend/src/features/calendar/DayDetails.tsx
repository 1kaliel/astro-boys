import { useEffect, useId, useRef } from "react";
import { Button } from "../../components/ui/Button";
import { formatCount } from "../../lib/format";
import { daynightText, dayCountText, dayLong, satelliteText, timeRange, type DayItem } from "./monthModel";

type DayDetailsProps = {
  cell: DayItem;
  /** "Native detections · S-NPP VIIRS · not harmonized". */
  source: string;
  /** For a month before February 2012: which satellite the days are, built from the answer. Null otherwise. */
  eraNote: string | null;
  onClose: () => void;
};

/**
 * One day of the month view: its native count and the satellite passes behind it. A side panel inside the calendar
 * card on wide screens, a bottom sheet on narrow ones (calendar-month.css). Close button, or Escape inside the month
 * view (MonthView handles it, so Escape in the tour or a dialog does not close it).
 */
export function DayDetails({ cell, source, eraNote, onClose }: DayDetailsProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Move the focus into the panel when it opens or shows another day, so keyboard and screen-reader users land here.
  useEffect(() => {
    titleRef.current?.focus();
  }, [cell.date]);

  const observed = cell.status === "observed";

  return (
    <aside className="day-details" role="region" aria-labelledby={titleId}>
      <header className="day-details-head">
        <h4 id={titleId} ref={titleRef} tabIndex={-1} className="day-details-title">
          {dayLong(cell.date)}
        </h4>
        <Button className="day-details-close" onClick={onClose} aria-label="Close day details">
          Close
        </Button>
      </header>

      <p className="day-details-count">{dayCountText(cell)}</p>
      {observed && <p className="day-details-source">{source}</p>}
      {observed && cell.count === 0 && (
        <p className="day-details-note">No detection does not mean no fire: clouds or smoke can hide activity.</p>
      )}
      {!observed && <p className="day-details-note">This day is after the last day of data in the archive.</p>}
      {cell.isLatest && <p className="day-details-note">Latest day with data.</p>}

      {observed && cell.passes.length > 0 && (
        <>
          <h5 className="day-details-subtitle">Satellite passes</h5>
          <ul className="day-details-passes">
            {cell.passes.map((pass, index) => (
              <li key={`${pass.satellite}-${pass.start_utc}-${index}`} className="day-pass">
                <p className="day-pass-title">
                  {satelliteText(pass.satellite)} · {daynightText(pass.daynight)}
                </p>
                <p>
                  Local {timeRange(pass.start_local, pass.end_local)} · UTC {timeRange(pass.start_utc, pass.end_utc)}
                </p>
                <p>
                  <strong>{formatCount(pass.count)}</strong> native {pass.count === 1 ? "detection" : "detections"}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      {observed && cell.passes.length === 0 && (cell.count ?? 0) > 0 && (
        <p className="day-details-note">Pass times are not available for this day.</p>
      )}
      {observed && cell.passes.length > 0 && cell.untimed > 0 && (
        <p className="day-details-note">
          {formatCount(cell.untimed)} {cell.untimed === 1 ? "detection has" : "detections have"} no acquisition time, so
          {cell.untimed === 1 ? " it is" : " they are"} counted in the day total but not in a pass.
        </p>
      )}

      {observed && (
        <p className="day-details-note">
          Times are acquisition times: when the satellite observed the area, not when the system received the data.
          Local time is solar time at the center of the area.
        </p>
      )}
      {eraNote && <p className="day-details-note">{eraNote}</p>}
    </aside>
  );
}
