import type { CellComponentProps } from "@nivo/heatmap";
import { createContext, useContext, type KeyboardEvent } from "react";
import { cx } from "../../lib/cx";
import { cellAriaLabel, type CalendarDatum } from "./calendarModel";

type MonthRef = { year: number; month: number };

type CellContext = {
  /** The month picked in the calendar (shared dashboard state). */
  selected: MonthRef | null;
  /** The one cell reachable with Tab; arrow keys move between cells. */
  tabStop: MonthRef | null;
  onSelect: (year: number, month: number) => void;
};

/** Selection lives in the dashboard state; the cell reads it from here so its identity stays stable. */
export const CalendarCellContext = createContext<CellContext>({
  selected: null,
  tabStop: null,
  onSelect: () => undefined,
});

// Geometry the SVG needs as numbers. Colors and stroke widths come from CSS tokens (calendar.css).
const ESTIMATED_INSET = 2;
const PARTIAL_MARK_RATIO = 0.5;
const MAX_KEY_STEPS = 12 * 40;

/** Arrow keys walk the calendar in reading order: left/right by month, up/down by year. */
const ARROWS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

function handleKeyDown(
  event: KeyboardEvent<SVGGElement>,
  year: number,
  month: number,
  onSelect: (year: number, month: number) => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect(year, month);
    return;
  }
  const step = ARROWS[event.key];
  const root = event.currentTarget.ownerSVGElement;
  if (!step || !root) return;
  event.preventDefault();
  let nextYear = year;
  let nextMonth = month;
  for (let i = 0; i < MAX_KEY_STEPS; i += 1) {
    nextYear += step.dy;
    nextMonth += step.dx;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    // Skip "no data" cells: they are not buttons.
    const target = root.querySelector<SVGGElement>(`[data-cell="${nextYear}-${nextMonth}"][role="button"]`);
    if (target) {
      target.focus();
      return;
    }
  }
}

/**
 * One month of the calendar, drawn for nivo's HeatMap (`cellComponent`).
 * Provenance rules (docs/design-system.md): estimated = fill + dashed outline, partial = corner mark,
 * no data = the null color and the words "No data" (never zero).
 */
export function CalendarCell({ cell, borderRadius, onMouseEnter, onMouseMove, onMouseLeave }: CellComponentProps<CalendarDatum>) {
  const { selected, tabStop, onSelect } = useContext(CalendarCellContext);
  const { entry, year, month } = cell.data;
  const { width, height } = cell;
  const hasData = entry !== null;
  const isSelected = selected?.year === year && selected.month === month;
  const isTabStop = tabStop?.year === year && tabStop.month === month;
  const mark = Math.min(width, height) * PARTIAL_MARK_RATIO;

  return (
    <g
      className={cx("calendar-cell", hasData && "calendar-cell-interactive")}
      // nivo positions cells by their center.
      transform={`translate(${cell.x - width / 2}, ${cell.y - height / 2})`}
      data-cell={`${year}-${month}`}
      role={hasData ? "button" : "img"}
      aria-label={cellAriaLabel(cell.data)}
      aria-pressed={hasData ? isSelected : undefined}
      tabIndex={hasData ? (isTabStop ? 0 : -1) : undefined}
      onMouseEnter={onMouseEnter?.(cell)}
      onMouseMove={onMouseMove?.(cell)}
      onMouseLeave={onMouseLeave?.(cell)}
      onClick={hasData ? () => onSelect(year, month) : undefined}
      onKeyDown={hasData ? (event) => handleKeyDown(event, year, month, onSelect) : undefined}
    >
      <rect className="calendar-cell-rect" width={width} height={height} rx={borderRadius} style={{ fill: cell.color }} />
      {entry?.isEstimated && (
        <rect
          className="calendar-cell-estimated"
          x={ESTIMATED_INSET}
          y={ESTIMATED_INSET}
          width={Math.max(0, width - 2 * ESTIMATED_INSET)}
          height={Math.max(0, height - 2 * ESTIMATED_INSET)}
        />
      )}
      {entry?.isPartial && (
        <polygon className="calendar-cell-partial" points={`${width - mark},0 ${width},0 ${width},${mark}`} />
      )}
      {isSelected && <rect className="calendar-cell-selected" width={width} height={height} rx={borderRadius} />}
    </g>
  );
}
