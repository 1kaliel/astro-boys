import { ResponsiveHeatMap, type ComputedCell, type TooltipProps } from "@nivo/heatmap";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ChartTableTabs } from "../../components/ui/ChartTableTabs";
import type { CalendarDataset } from "../../data/calendarSource";
import type { CalendarLoad } from "../../data/useCalendar";
import { MONTHS_LONG, MONTHS_SHORT, formatCount } from "../../lib/format";
import { useDashboard } from "../../state/dashboard";
import { CalendarAxes, CalendarCell, CalendarCellContext, CalendarDefs } from "./CalendarCell";
import { CalendarLegend } from "./CalendarLegend";
import { CalendarTable } from "./CalendarTable";
import { MonthFilter } from "./MonthFilter";
import {
  buildScale,
  buildSeries,
  legendRanges,
  monthSpan,
  peakSeason,
  provenanceText,
  scaleStep,
  type CalendarDatum,
  type CalendarSerie,
} from "./calendarModel";
import { monthLong, monthShort } from "./calendarText";

export const CALENDAR_UNIT = "VIIRS-equivalent hotspot detections per month";

// Chart geometry in pixels (nivo needs numbers; colors and strokes come from tokens in calendar.css).
const ROW_PX = 26;
const MARGIN = { top: 30, right: 4, bottom: 4, left: 44 };
const MIN_CELL_PX = 40; // below this width the grid scrolls sideways instead of squeezing the labels
const MAX_CELL_PX = 72; // with few months the cells stop growing instead of turning into long bars

const THEME = {
  // Our own tooltip draws its box; nivo's wrapper stays transparent.
  tooltip: { container: { background: "transparent", boxShadow: "none", padding: 0 } },
};

/** The detail of a cell: month, year, count and the state of the data (observed, estimated, partial, zero, none). */
function CalendarTooltip({ cell, approximate }: TooltipProps<CalendarDatum> & { approximate: boolean }) {
  const { entry, year, month } = cell.data;
  return (
    <div className="tooltip calendar-tooltip">
      <p className="calendar-tooltip-title">
        {monthLong(month)} {year}
      </p>
      {entry ? (
        <>
          {entry.count === null ? (
            <p>
              <strong>No estimate</strong> for this month
            </p>
          ) : (
            <p>
              <strong>{formatCount(entry.count)}</strong> hotspot detections
            </p>
          )}
          {entry.count === 0 && <p>Zero detections: a valid count, not missing data</p>}
          {entry.isEstimated && entry.count !== null && (
            <p>
              {entry.ciLow !== null && entry.ciHigh !== null
                ? `90% interval${approximate ? " (approximate)" : ""}: ${formatCount(entry.ciLow)} to ${formatCount(entry.ciHigh)}`
                : "90% interval: pending"}
            </p>
          )}
          <p>{provenanceText(entry)}</p>
        </>
      ) : (
        <p>
          <strong>No data</strong> for this month
        </p>
      )}
    </div>
  );
}

/** The month the keyboard can Tab to: the selected one, else the latest month with data. */
function latestWithData(series: ReadonlyArray<CalendarSerie>): { year: number; month: number } | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const row = series[i];
    for (let j = row.data.length - 1; j >= 0; j -= 1) {
      const cell = row.data[j];
      if (cell.entry) return { year: cell.year, month: cell.month };
    }
  }
  return null;
}

function CalendarView({ dataset, refreshing }: { dataset: CalendarDataset; refreshing: boolean }) {
  const [state, dispatch] = useDashboard();
  const [hovered, setHovered] = useState<{ year: number; month: number } | null>(null);
  // Only years the data covers are shown: the selector can go past the last published year.
  const startYear = Math.max(state.startYear, dataset.firstYear);
  const endYear = Math.min(state.endYear, dataset.lastYear);
  // While a new period loads, the old dataset is still on screen: read it with its own period.
  const period = dataset.period ?? state.period;

  // Every month of the years shown: the "Peak" shortcut is found here, so it does not move with the filter.
  const fullSeries = useMemo(
    () => buildSeries(dataset.months, period, startYear, endYear),
    [dataset, period, startYear, endYear],
  );
  const peak = useMemo(() => peakSeason(fullSeries), [fullSeries]);
  const series = useMemo(
    () => buildSeries(dataset.months, period, startYear, endYear, state.months),
    [dataset, period, startYear, endYear, state.months],
  );
  // The colors are recomputed for what is on screen, so a season filter uses the whole ramp.
  const scale = useMemo(
    () => buildScale(series.flatMap((row) => row.data.flatMap((cell) => (cell.y === null ? [] : [cell.y])))),
    [series],
  );
  const onSelect = useCallback((year: number, month: number) => dispatch({ type: "select", year, month }), [dispatch]);

  const selectedHasData = state.selected
    ? series.some((row) =>
        row.data.some((c) => c.entry && c.year === state.selected?.year && c.month === state.selected.month),
      )
    : false;
  const tabStop = selectedHasData ? state.selected : latestWithData(series);
  // A month the filter just hid cannot stay highlighted.
  const hoverShown =
    hovered && series.some((row) => row.id === String(hovered.year) && row.data.some((c) => c.month === hovered.month));
  const contextValue = useMemo(
    () => ({ selected: state.selected, tabStop, onSelect, hovered: hoverShown ? hovered : null, setHovered }),
    [state.selected, tabStop, onSelect, hovered, hoverShown],
  );

  // A valid zero has its own fill and is printed as "0"; a count takes a step of the ramp; no data is hatched
  // by the cell itself (it never reaches this function with a number).
  const colors = useCallback(
    (cell: Omit<ComputedCell<CalendarDatum>, "color" | "opacity" | "borderColor" | "labelTextColor">) => {
      if (cell.value === null || !scale) return "var(--viz-null)";
      if (cell.value === 0) return "var(--cal-zero)";
      return `var(--viz-seq-${scaleStep(cell.value, scale)})`;
    },
    [scale],
  );

  // Intervals of an area are approximate; say so where the interval is shown and once above the chart.
  const tooltip = useCallback(
    (props: TooltipProps<CalendarDatum>) => <CalendarTooltip {...props} approximate={dataset.intervalApproximate} />,
    [dataset.intervalApproximate],
  );
  const showsIntervals = dataset.intervalApproximate && dataset.months.some((m) => m.isEstimated && m.ciLow !== null);

  const filter = (
    <MonthFilter months={state.months} peak={peak} onChange={(months) => dispatch({ type: "setMonths", months })} />
  );

  if (!scale) {
    return (
      <div className="calendar">
        {filter}
        <p className="calendar-status" role="status">
          No hotspot data for this selection. Try another time of day, other months or a wider range of years.
        </p>
      </div>
    );
  }

  const columns = series[0]?.data.length ?? 12;
  const chart = (
    <div className="calendar-scroll">
      <div
        className="calendar-chart"
        style={{
          height: series.length * ROW_PX + MARGIN.top + MARGIN.bottom,
          minWidth: MARGIN.left + MARGIN.right + columns * MIN_CELL_PX,
          maxWidth: MARGIN.left + MARGIN.right + columns * MAX_CELL_PX,
        }}
      >
        <CalendarCellContext.Provider value={contextValue}>
          <ResponsiveHeatMap
            data={series}
            margin={MARGIN}
            layers={[CalendarDefs, "cells", CalendarAxes]}
            cellComponent={CalendarCell}
            tooltip={tooltip}
            colors={colors}
            emptyColor="var(--viz-null)"
            borderColor="var(--viz-cell-outline)"
            labelTextColor="var(--color-text-primary)"
            enableLabels={false}
            xInnerPadding={0}
            yInnerPadding={0}
            axisTop={null}
            axisLeft={null}
            axisRight={null}
            axisBottom={null}
            hoverTarget="cell"
            inactiveOpacity={1}
            animate={false}
            theme={THEME}
            role="group"
            ariaLabel={`Burning calendar: ${CALENDAR_UNIT}, ${monthShort(1)} to ${monthShort(12)}, by year`}
          />
        </CalendarCellContext.Provider>
      </div>
    </div>
  );

  return (
    <div className="calendar">
      {filter}
      {dataset.synthetic && (
        <p className="calendar-notice">
          <Badge kind="simulated" /> Synthetic numbers, for building the screen. They are not results.
        </p>
      )}
      {!dataset.synthetic && (
        <p className="calendar-notice">
          {`Data ${dataset.firstYear}–${dataset.lastYear}, model ${dataset.modelVersion}`}
          {dataset.cells !== null && `, ${dataset.cells.toLocaleString("en-US")} L2 cells with data`}
          {state.months.length > 0 && `. Showing ${monthSpan(state.months)}`}
          {refreshing && ". Updating…"}
        </p>
      )}
      {showsIntervals && (
        <p className="calendar-notice">
          Intervals for an area are approximate: the errors of nearby cells are correlated, so the interval of the sum is
          widened (variance sum × n<sup>0.32</sup>).
        </p>
      )}
      {state.scale === "raw" && (
        <p className="calendar-notice">Raw counts by sensor are not available yet. Showing harmonized counts.</p>
      )}
      <ChartTableTabs
        label="Burning calendar"
        chart={chart}
        table={<CalendarTable series={series} unit={CALENDAR_UNIT} />}
      />
      <CalendarLegend ranges={legendRanges(scale)} unit={CALENDAR_UNIT} />
    </div>
  );
}

/**
 * Year x month heatmap of hotspot detections (task D4): loading, error, empty and ready states.
 * The page loads the calendar once (`useCalendarDataset`) and shares it with the KPI row.
 */
export function BurningCalendar({ load, reload }: { load: CalendarLoad; reload: () => void }) {
  if (load.status === "loading") {
    return (
      <p className="calendar-status" role="status">
        Loading the calendar…
      </p>
    );
  }
  if (load.status === "error") {
    return (
      <div className="calendar-status" role="alert">
        <p>The calendar could not be loaded. {load.message}</p>
        <Button onClick={reload}>Try again</Button>
      </div>
    );
  }
  return <CalendarView dataset={load.dataset} refreshing={load.refreshing} />;
}
