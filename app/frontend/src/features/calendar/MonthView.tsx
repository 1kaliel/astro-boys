import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type RefObject } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ChartTableTabs } from "../../components/ui/ChartTableTabs";
import type { CalendarDataset } from "../../data/calendarSource";
import { useDaily, type DailyRequest } from "../../data/daily";
import { cx } from "../../lib/cx";
import { formatCompact, formatCount } from "../../lib/format";
import { useDashboard } from "../../state/dashboard";
import "../../styles/calendar-month.css";
import { legendRanges, type ColorScale } from "./calendarModel";
import { monthLong } from "./calendarText";
import { DayDetails } from "./DayDetails";
import {
  WEEKDAYS_SHORT,
  buildMonthGrid,
  compareMonths,
  dailyErrorText,
  dayAriaLabel,
  dayCountText,
  dayFill,
  dayItems,
  dayLong,
  dayScale,
  harmonizedTotalText,
  isEstimatedEra,
  monthBounds,
  moveDay,
  nativeTotal,
  satelliteForSensor,
  satelliteText,
  shiftMonth,
  sourceLabel,
  type DayCell,
  type DayItem,
} from "./monthModel";

const MAX_KEY_STEPS = 31;

/** Month level of the calendar: the days of one month, native detections of one satellite (GET /api/daily). */
export function MonthView({ dataset }: { dataset: CalendarDataset }) {
  const [state, dispatch] = useDashboard();
  // The caller renders this view only with a selected month.
  const { year, month } = state.selected ?? { year: dataset.lastYear, month: 12 };
  const period = dataset.period ?? state.period;
  const satellite = satelliteForSensor(state.sensor);

  const request = useMemo<DailyRequest>(
    () => ({ area: state.area, year, month, period: state.period, satellite }),
    [state.area, year, month, state.period, satellite],
  );
  const remote = useDaily(request);
  // The hook keeps the last answer while a new one loads: only use it when it is this month's.
  const data = remote.data && remote.data.year === year && remote.data.month === month && Array.isArray(remote.data.days)
    ? remote.data
    : null;
  const refreshing = data !== null && remote.loading;

  const cells = useMemo(
    () => buildMonthGrid(year, month, data?.days ?? [], data?.last_date ?? null),
    [year, month, data],
  );
  const scale = useMemo(() => dayScale(cells), [cells]);

  const harmonized =
    dataset.months.find((m) => m.year === year && m.month === month && m.period === period) ?? null;
  const bounds = useMemo(() => monthBounds(dataset.months), [dataset.months]);
  const prev = shiftMonth({ year, month }, -1);
  const next = shiftMonth({ year, month }, 1);
  const canPrev = !bounds || compareMonths(prev, bounds.first) >= 0;
  const canNext = !bounds || compareMonths(next, bounds.last) <= 0;
  const estimatedEra = isEstimatedEra({ year, month });
  const monthName = `${monthLong(month)} ${year}`;
  const source = data ? sourceLabel(data) : "Native detections · not harmonized";
  const satName = data ? satelliteText(data.satellite, data.instrument) : "";

  const headingRef = useRef<HTMLHeadingElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Arriving from the years: the focus lands on the month's name.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const showYears = () => {
    const target = `${year}-${month}`;
    dispatch({ type: "showYears" });
    // Back in the years, the focus returns to the month that was open.
    window.setTimeout(() => document.querySelector<SVGGElement>(`[data-cell="${target}"][role="button"]`)?.focus(), 0);
  };

  const selectedCell = state.day ? (dayItems(cells).find((c) => c.date === state.day) ?? null) : null;
  const closeDay = useCallback(() => {
    const day = state.day;
    dispatch({ type: "selectDay", day: null });
    window.setTimeout(() => gridRef.current?.querySelector<HTMLElement>(`[data-date="${day}"]`)?.focus(), 0);
  }, [dispatch, state.day]);

  let body;
  if (!data && remote.error && !remote.loading) {
    const { missing, text } = dailyErrorText(remote.error);
    body = (
      <div className="calendar-status" role="alert">
        <p>{text}</p>
        {missing ? (
          <p>The month total above comes from the harmonized calendar.</p>
        ) : null}
        <Button onClick={remote.retry}>Retry</Button>
      </div>
    );
  } else if (!data) {
    body = <MonthSkeleton cells={cells} label={`Loading the days of ${monthName}`} />;
  } else {
    const chart = (
      <div className={cx("month-chart", refreshing && "is-refreshing")} aria-busy={refreshing || undefined}>
        <MonthGrid
          gridRef={gridRef}
          cells={cells}
          scale={scale}
          selected={state.day}
          satellite={satName}
          monthName={monthName}
          onSelect={(day) => dispatch({ type: "selectDay", day })}
        />
        <p className="calendar-notice">Data up to {dayLong(data.last_date)}.</p>
        <MonthLegend scale={scale} />
      </div>
    );
    body = (
      <ChartTableTabs
        label={`Days of ${monthName}`}
        chart={chart}
        table={<MonthTable cells={cells} source={source} monthName={monthName} />}
      />
    );
  }

  const total = data ? nativeTotal(cells) : null;

  return (
    <div className="calendar month-view">
      <div className="month-view-head">
        <Button className="month-view-back" onClick={showYears}>
          <span aria-hidden="true">←</span> All years
        </Button>
        <div className="month-view-nav">
          <Button
            className="month-view-step"
            disabled={!canPrev}
            aria-label={`Previous month: ${monthLong(prev.month)} ${prev.year}`}
            onClick={() => dispatch({ type: "openMonth", ...prev })}
          >
            <span aria-hidden="true">‹</span>
          </Button>
          <h3 ref={headingRef} tabIndex={-1} className="month-view-title" aria-live="polite">
            {monthName}
          </h3>
          <Button
            className="month-view-step"
            disabled={!canNext}
            aria-label={`Next month: ${monthLong(next.month)} ${next.year}`}
            onClick={() => dispatch({ type: "openMonth", ...next })}
          >
            <span aria-hidden="true">›</span>
          </Button>
        </div>
      </div>

      <dl className="month-view-totals">
        <div className="month-view-total">
          <dt>{source}</dt>
          <dd>
            {total === null ? "–" : formatCount(total)}
            <span className="month-view-total-unit"> in the days with data</span>
          </dd>
        </div>
        <div className="month-view-total">
          <dt>Harmonized month total (monthly only)</dt>
          <dd>
            {harmonizedTotalText(harmonized)}
            {harmonized?.isEstimated && <Badge kind="estimated" />}
            {harmonized?.isPartial && <Badge kind="partial" />}
          </dd>
        </div>
      </dl>
      <p className="calendar-notice">
        Daily numbers are native detections of one satellite and are not harmonized: they do not add up to the
        harmonized month total.
        {estimatedEra && " This month is before VIIRS (February 2012): its days are native Aqua MODIS detections."}
      </p>

      <div className={cx("month-view-body", selectedCell && "has-details")}>
        <div className="month-view-main">{body}</div>
        {selectedCell && (
          <DayDetails cell={selectedCell} source={source} estimatedEra={estimatedEra} onClose={closeDay} />
        )}
      </div>
    </div>
  );
}

type MonthGridProps = {
  gridRef: RefObject<HTMLDivElement | null>;
  cells: readonly DayCell[];
  scale: ColorScale | null;
  selected: string | null;
  satellite: string;
  monthName: string;
  onSelect: (date: string) => void;
};

/** Monday-first grid of the month. One tab stop; arrows move by day and week, Home / End to the week's ends. */
function MonthGrid({ gridRef, cells, scale, selected, satellite, monthName, onSelect }: MonthGridProps) {
  const days = dayItems(cells);
  const observed = days.filter((d) => d.status === "observed");
  const tabStop =
    observed.find((d) => d.date === selected)?.date ??
    observed.find((d) => d.isLatest)?.date ??
    observed[observed.length - 1]?.date ??
    null;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, cell: DayItem) => {
    let day = cell.day;
    for (let i = 0; i < MAX_KEY_STEPS; i += 1) {
      const target = moveDay(day, event.key, days.length, days[day - 1].weekday);
      if (target === null) return;
      event.preventDefault();
      if (target === day) return;
      const button = gridRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${days[target - 1].date}"]`);
      if (button) {
        button.focus();
        return;
      }
      // A day with no data is not a button: keep going the same way (Home / End stop at the first try).
      if (event.key === "Home" || event.key === "End") return;
      day = target;
    }
  };

  return (
    <div className="month-grid-wrap">
      <div className="month-weekdays" aria-hidden="true">
        {WEEKDAYS_SHORT.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div ref={gridRef} className="month-grid" role="group" aria-label={`Days of ${monthName}`}>
        {cells.map((cell) => {
          if (cell.kind === "blank") return <span key={cell.key} className="month-day month-day-blank" aria-hidden="true" />;
          const fill = dayFill(cell, scale);
          const label = dayAriaLabel(cell, satellite);
          if (fill === "nodata") {
            return (
              <div key={cell.key} className="month-day month-day-nodata" role="img" aria-label={label} title={label}>
                <span className="month-day-num">{cell.day}</span>
              </div>
            );
          }
          const isSelected = selected === cell.date;
          return (
            <button
              key={cell.key}
              type="button"
              data-date={cell.date}
              className={cx(
                "month-day",
                fill === "zero" ? "month-day-zero" : `month-day-step-${fill}`,
                typeof fill === "number" && fill >= 5 && "is-dark",
                cell.isLatest && "is-latest",
                isSelected && "is-selected",
              )}
              style={typeof fill === "number" ? { background: `var(--viz-seq-${fill})` } : undefined}
              aria-label={label}
              aria-pressed={isSelected}
              title={label}
              tabIndex={cell.date === tabStop ? 0 : -1}
              onClick={() => onSelect(cell.date)}
              onKeyDown={(event) => onKeyDown(event, cell)}
            >
              <span className="month-day-num">{cell.day}</span>
              <span className="month-day-count">{cell.count === 0 ? "0" : formatCompact(cell.count)}</span>
              {cell.isLatest && (
                <span className="month-day-latest" aria-hidden="true">
                  latest
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Placeholder squares while the month loads (first load only; a reload dims the month on screen). */
function MonthSkeleton({ cells, label }: { cells: readonly DayCell[]; label: string }) {
  return (
    <div className="month-grid-wrap" role="status" aria-label={label}>
      <div className="month-weekdays" aria-hidden="true">
        {WEEKDAYS_SHORT.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="month-grid" aria-hidden="true">
        {cells.map((cell) =>
          cell.kind === "blank" ? (
            <span key={cell.key} className="month-day month-day-blank" />
          ) : (
            <span key={cell.key} className="month-day month-day-skeleton">
              <span className="month-day-num">{cell.day}</span>
            </span>
          ),
        )}
      </div>
      <p className="calendar-notice">{label}…</p>
    </div>
  );
}

/** Colors of this month only (quantile steps of its observed days), and the states of a day. */
function MonthLegend({ scale }: { scale: ColorScale | null }) {
  const ranges = scale ? legendRanges(scale) : [];
  return (
    <div className="calendar-legend month-legend" aria-label="Legend">
      <p className="calendar-legend-title">Native detections per day, not harmonized. Colors are for this month only.</p>
      {ranges.length > 0 && (
        <ol className="calendar-legend-scale" aria-label="Native detections per day, by color">
          {ranges.map((range) => (
            <li key={`${range.step}-${range.from}`} className="calendar-legend-segment month-legend-segment">
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
          No detection
        </li>
        <li>
          <span className="calendar-chip calendar-chip-nodata" aria-hidden="true" />
          No data yet
        </li>
        <li>
          <span className="calendar-chip month-chip-latest" aria-hidden="true" />
          Latest data
        </li>
        <li>
          <span className="calendar-chip calendar-chip-selected" aria-hidden="true" />
          Selected day
        </li>
      </ul>
    </div>
  );
}

/** The same days as a table: exact values for keyboard and screen-reader users. */
function MonthTable({ cells, source, monthName }: { cells: readonly DayCell[]; source: string; monthName: string }) {
  return (
    <div className="calendar-table-wrap" role="region" aria-label={`Days of ${monthName}, table view`} tabIndex={0}>
      <table className="calendar-table">
        <caption className="calendar-table-caption">
          {source}, by local solar day, {monthName}
        </caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Native detections</th>
            <th scope="col">Passes</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {dayItems(cells).map((cell) => (
            <tr key={cell.date}>
              <th scope="row">{dayLong(cell.date)}</th>
              <td>{cell.status === "observed" ? formatCount(cell.count) : "–"}</td>
              <td>{cell.status === "observed" ? cell.passes.length : "–"}</td>
              <td>
                {cell.status !== "observed" ? dayCountText(cell) : cell.count === 0 ? "No detection" : ""}
                {cell.isLatest ? " Latest data" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
