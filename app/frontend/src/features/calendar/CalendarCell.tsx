import type { CellComponentProps, CustomLayerProps } from "@nivo/heatmap";
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
  /** The month under the pointer or the keyboard focus. Its row and column are highlighted, the rest is dimmed. */
  hovered: MonthRef | null;
  setHovered: (month: MonthRef | null) => void;
};

/** Selection and hover live above the chart; the cell reads them from here so its identity stays stable. */
export const CalendarCellContext = createContext<CellContext>({
  selected: null,
  tabStop: null,
  onSelect: () => undefined,
  hovered: null,
  setHovered: () => undefined,
});

// Geometry the SVG needs as numbers. Colors and stroke widths come from CSS tokens (calendar.css).
const ESTIMATED_INSET = 2;
const PARTIAL_MARK_RATIO = 0.5;
const MAX_KEY_STEPS = 12 * 40;
const AXIS_GAP_PX = 8;

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
    // Skip "no data" cells (they are not buttons) and months that the filter hides.
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
 * Pointer or focus on a cell highlights its row (year) and column (month) and dims the others.
 */
export function CalendarCell({ cell, borderRadius, onMouseEnter, onMouseMove, onMouseLeave }: CellComponentProps<CalendarDatum>) {
  const { selected, tabStop, onSelect, hovered, setHovered } = useContext(CalendarCellContext);
  const { entry, year, month } = cell.data;
  const { width, height } = cell;
  const hasData = entry !== null;
  const isSelected = selected?.year === year && selected.month === month;
  const isTabStop = tabStop?.year === year && tabStop.month === month;
  const isHovered = hovered?.year === year && hovered.month === month;
  const isDimmed = hovered !== null && hovered.year !== year && hovered.month !== month;
  const mark = Math.min(width, height) * PARTIAL_MARK_RATIO;
  const showTooltip = onMouseEnter?.(cell);
  const moveTooltip = onMouseMove?.(cell);
  const hideTooltip = onMouseLeave?.(cell);

  return (
    <g
      className={cx(
        "calendar-cell",
        hasData && "calendar-cell-interactive",
        isHovered && "calendar-cell-hover",
        isDimmed && "calendar-cell-dim",
      )}
      // nivo positions cells by their center.
      transform={`translate(${cell.x - width / 2}, ${cell.y - height / 2})`}
      data-cell={`${year}-${month}`}
      role={hasData ? "button" : "img"}
      aria-label={cellAriaLabel(cell.data)}
      aria-pressed={hasData ? isSelected : undefined}
      tabIndex={hasData ? (isTabStop ? 0 : -1) : undefined}
      onMouseEnter={(event) => {
        setHovered({ year, month });
        showTooltip?.(event);
      }}
      onMouseMove={moveTooltip}
      onMouseLeave={(event) => {
        setHovered(null);
        hideTooltip?.(event);
      }}
      onFocus={hasData ? () => setHovered({ year, month }) : undefined}
      onBlur={hasData ? () => setHovered(null) : undefined}
      onClick={hasData ? () => onSelect(year, month) : undefined}
      onKeyDown={hasData ? (event) => handleKeyDown(event, year, month, onSelect) : undefined}
    >
      <rect className="calendar-cell-rect" width={width} height={height} rx={borderRadius} style={{ fill: cell.color }} />
      {entry?.isEstimated && (
        <>
          {/* Two layers: a solid line in the surface color, then the dashes. Dashes alone vanish on dark cells. */}
          <rect
            className="calendar-cell-estimated-casing"
            x={ESTIMATED_INSET}
            y={ESTIMATED_INSET}
            width={Math.max(0, width - 2 * ESTIMATED_INSET)}
            height={Math.max(0, height - 2 * ESTIMATED_INSET)}
          />
          <rect
            className="calendar-cell-estimated"
            x={ESTIMATED_INSET}
            y={ESTIMATED_INSET}
            width={Math.max(0, width - 2 * ESTIMATED_INSET)}
            height={Math.max(0, height - 2 * ESTIMATED_INSET)}
          />
        </>
      )}
      {entry?.isPartial && (
        <polygon className="calendar-cell-partial" points={`${width - mark},0 ${width},0 ${width},${mark}`} />
      )}
      {isSelected && <rect className="calendar-cell-selected" width={width} height={height} rx={borderRadius} />}
    </g>
  );
}

/**
 * Month names above the columns and years left of the rows. Drawn here (not by nivo's axes) so the month and the
 * year under the pointer can be highlighted.
 */
export function CalendarAxes({ cells }: CustomLayerProps<CalendarDatum>) {
  const { hovered } = useContext(CalendarCellContext);
  const columns = new Map<number, { label: string; x: number }>();
  const rows = new Map<string, { label: string; y: number }>();
  for (const cell of cells) {
    columns.set(cell.data.month, { label: cell.data.x, x: cell.x });
    rows.set(cell.serieId, { label: cell.serieId, y: cell.y });
  }
  return (
    <g className="calendar-axes" aria-hidden="true">
      {[...columns.entries()].map(([month, { label, x }]) => (
        <text
          key={`m${month}`}
          className={cx("calendar-axis-label", hovered?.month === month && "is-active")}
          x={x}
          y={-AXIS_GAP_PX}
          textAnchor="middle"
        >
          {label}
        </text>
      ))}
      {[...rows.entries()].map(([year, { label, y }]) => (
        <text
          key={`y${year}`}
          className={cx("calendar-axis-label", hovered !== null && String(hovered.year) === year && "is-active")}
          x={-AXIS_GAP_PX}
          y={y}
          textAnchor="end"
          dominantBaseline="central"
        >
          {label}
        </text>
      ))}
    </g>
  );
}
