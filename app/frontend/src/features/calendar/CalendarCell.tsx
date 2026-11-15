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
  /** Months the legend filter switched off: they stay in place, faded. */
  isFiltered: (datum: CalendarDatum) => boolean;
};

/** Selection and hover live above the chart; the cell reads them from here so its identity stays stable. */
export const CalendarCellContext = createContext<CellContext>({
  selected: null,
  tabStop: null,
  onSelect: () => undefined,
  hovered: null,
  setHovered: () => undefined,
  isFiltered: () => false,
});

// Geometry the SVG needs as numbers. Colors and stroke widths come from CSS tokens (calendar.css).
/** Space between neighbouring cells, the same in every direction. */
export const CELL_GAP_PX = 3;
const CELL_RADIUS_PX = 6;
const MARK_INSET_PX = 4;
const ESTIMATED_DOT_RADIUS_PX = 2.5;
const PARTIAL_MARK_RATIO = 0.42;
const MAX_KEY_STEPS = 12 * 40;
const AXIS_GAP_PX = 8;
/** Id of the diagonal hatching that fills months with no data (defined by CalendarDefs). */
export const HATCH_ID = "calendar-no-data-hatch";

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
 * The hatching that fills months with no data. Rendered once, as a nivo layer, so cells can use `url(#...)`.
 * Colors come from the calendar theme (calendar.css).
 */
export function CalendarDefs() {
  return (
    <defs>
      <pattern id={HATCH_ID} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect className="calendar-hatch-bg" width={6} height={6} />
        <line className="calendar-hatch-line" x1={0} y1={0} x2={0} y2={6} />
      </pattern>
    </defs>
  );
}

/**
 * One month of the calendar, drawn for nivo's HeatMap (`cellComponent`).
 *
 * States, each with its own look (never color alone):
 *  - a count: solid fill from the ramp;
 *  - a valid zero: the palest fill with a printed "0" (a measurement, not a gap);
 *  - estimated from MODIS: a small dot in the corner;
 *  - partial month: a corner mark (the month is not complete, so the count is not comparable);
 *  - no data or no estimate: neutral diagonal hatching, no number;
 *  - selected: a petrol outline; keyboard focus: a ring.
 * Pointer or focus on a cell highlights its row (year) and column (month) and dims the others.
 */
export function CalendarCell({ cell, onMouseEnter, onMouseMove, onMouseLeave }: CellComponentProps<CalendarDatum>) {
  const { selected, tabStop, onSelect, hovered, setHovered, isFiltered } = useContext(CalendarCellContext);
  const { entry, year, month } = cell.data;
  const hasData = entry !== null;
  const hasCount = entry !== null && entry.count !== null;
  const isZero = hasCount && entry.count === 0;
  const isSelected = selected?.year === year && selected.month === month;
  const isTabStop = tabStop?.year === year && tabStop.month === month;
  const isHovered = hovered?.year === year && hovered.month === month;
  const isDimmed = hovered !== null && hovered.year !== year && hovered.month !== month;
  const isOff = isFiltered(cell.data);
  const showTooltip = onMouseEnter?.(cell);
  const moveTooltip = onMouseMove?.(cell);
  const hideTooltip = onMouseLeave?.(cell);

  // The drawn square is inset by half the gap on every side, so the space between cells is exactly the gap.
  const inset = CELL_GAP_PX / 2;
  const width = Math.max(0, cell.width - CELL_GAP_PX);
  const height = Math.max(0, cell.height - CELL_GAP_PX);
  const radius = Math.min(CELL_RADIUS_PX, height / 2);
  const mark = Math.min(width, height) * PARTIAL_MARK_RATIO;
  const fill = hasCount ? cell.color : `url(#${HATCH_ID})`;

  return (
    <g
      className={cx(
        "calendar-cell",
        hasData && "calendar-cell-interactive",
        isHovered && "calendar-cell-hover",
        isDimmed && "calendar-cell-dim",
        isOff && "calendar-cell-off",
        !hasCount && "calendar-cell-empty",
        isZero && "calendar-cell-zero",
      )}
      // nivo positions cells by their center.
      transform={`translate(${cell.x - cell.width / 2 + inset}, ${cell.y - cell.height / 2 + inset})`}
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
      <rect className="calendar-cell-rect" width={width} height={height} rx={radius} style={{ fill }} />
      {isZero && (
        <text className="calendar-cell-zero-label" x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="central">
          0
        </text>
      )}
      {entry?.isEstimated && (
        <circle
          className="calendar-cell-estimated-dot"
          cx={MARK_INSET_PX + ESTIMATED_DOT_RADIUS_PX}
          cy={MARK_INSET_PX + ESTIMATED_DOT_RADIUS_PX}
          r={ESTIMATED_DOT_RADIUS_PX}
        />
      )}
      {entry?.isPartial && (
        <polygon
          className="calendar-cell-partial"
          points={`${width - mark},0 ${width - radius / 2},0 ${width},${radius / 2} ${width},${mark}`}
        />
      )}
      {isSelected && (
        <>
          {/* A white edge next to the petrol outline, so the selection shows on the darkest fills too. */}
          <rect className="calendar-cell-selected-casing" width={width} height={height} rx={radius} />
          <rect className="calendar-cell-selected" width={width} height={height} rx={radius} />
        </>
      )}
      <rect
        className="calendar-cell-focus-ring"
        x={-inset}
        y={-inset}
        width={width + CELL_GAP_PX}
        height={height + CELL_GAP_PX}
        rx={radius + inset}
      />
    </g>
  );
}

/**
 * Month names above the columns and years left of the rows. Drawn here (not by nivo's axes) so the month and the
 * year under the pointer can be highlighted.
 */
const NARROW_COLUMN_PX = 30;

export function CalendarAxes({ cells }: CustomLayerProps<CalendarDatum>) {
  const { hovered } = useContext(CalendarCellContext);
  const columns = new Map<number, { label: string; x: number }>();
  const rows = new Map<string, { label: string; y: number }>();
  for (const cell of cells) {
    // Narrow columns (a phone) get the first letter only; the full name is in the cell's label and detail.
    columns.set(cell.data.month, { label: cell.width < NARROW_COLUMN_PX ? cell.data.x.charAt(0) : cell.data.x, x: cell.x });
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
