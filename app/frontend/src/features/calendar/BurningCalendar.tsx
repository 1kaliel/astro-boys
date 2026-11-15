import { ResponsiveHeatMap, type ComputedCell, type TooltipProps } from "@nivo/heatmap";
import { useCallback, useMemo } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ChartTableTabs } from "../../components/ui/ChartTableTabs";
import { Legend } from "../../components/viz/Legend";
import type { CalendarDataset } from "../../data/calendarSource";
import { useCalendarDataset } from "../../data/useCalendar";
import { MONTHS_LONG, MONTHS_SHORT, formatCount } from "../../lib/format";
import { useDashboard } from "../../state/dashboard";
import { CalendarCell, CalendarCellContext } from "./CalendarCell";
import { CalendarTable } from "./CalendarTable";
import {
  binIndex,
  buildSeries,
  provenanceText,
  valueRange,
  type CalendarDatum,
  type CalendarSerie,
} from "./calendarModel";

export const CALENDAR_UNIT = "VIIRS-equivalent hotspot detections per month";

// Chart geometry in pixels (nivo needs numbers; colors and strokes come from tokens in calendar.css).
const ROW_PX = 22;
const MARGIN = { top: 28, right: 8, bottom: 8, left: 44 };
const CELL_PADDING = 0.1;
const AXIS_FONT_PX = 12;

const THEME = {
  text: { fill: "var(--color-text-secondary)", fontFamily: "inherit", fontSize: AXIS_FONT_PX },
  // Our own tooltip draws its box; nivo's wrapper stays transparent.
  tooltip: { container: { background: "transparent", boxShadow: "none", padding: 0 } },
};

function CalendarTooltip({ cell }: TooltipProps<CalendarDatum>) {
  const { entry, year, month } = cell.data;
  return (
    <div className="tooltip calendar-tooltip">
      <p className="calendar-tooltip-title">
        {MONTHS_LONG[month - 1]} {year}
      </p>
      {entry ? (
        <>
          <p>
            <strong>{formatCount(entry.count)}</strong> hotspot detections
          </p>
          {entry.isEstimated && (
            <p>
              {entry.ciLow !== null && entry.ciHigh !== null
                ? `90% interval: ${formatCount(entry.ciLow)} to ${formatCount(entry.ciHigh)}`
                : "90% interval: pending"}
            </p>
          )}
          <p>{provenanceText(entry)}</p>
        </>
      ) : (
        <p>No data</p>
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
  // Only years the data covers are shown: the selector can go past the last published year.
  const startYear = Math.max(state.startYear, dataset.firstYear);
  const endYear = Math.min(state.endYear, dataset.lastYear);
  // While a new period loads, the old dataset is still on screen: read it with its own period.
  const period = dataset.period ?? state.period;
  const series = useMemo(
    () => buildSeries(dataset.months, period, startYear, endYear),
    [dataset, period, startYear, endYear],
  );
  const range = useMemo(() => valueRange(series), [series]);
  const onSelect = useCallback((year: number, month: number) => dispatch({ type: "select", year, month }), [dispatch]);

  const selectedHasData = state.selected
    ? series.some((row) => row.data.some((c) => c.entry && c.year === state.selected?.year && c.month === state.selected.month))
    : false;
  const tabStop = selectedHasData ? state.selected : latestWithData(series);
  const contextValue = useMemo(
    () => ({ selected: state.selected, tabStop, onSelect }),
    [state.selected, tabStop, onSelect],
  );

  const colors = useCallback(
    (cell: Omit<ComputedCell<CalendarDatum>, "color" | "opacity" | "borderColor" | "labelTextColor">) =>
      cell.value === null || !range
        ? "var(--viz-null)"
        : `var(--viz-seq-${binIndex(cell.value, range.min, range.max)})`,
    [range],
  );

  if (!range) {
    return (
      <p className="calendar-status" role="status">
        No hotspot data for this selection. Try another time of day or a wider range of years.
      </p>
    );
  }

  const chart = (
    <div className="calendar-chart" style={{ height: series.length * ROW_PX + MARGIN.top + MARGIN.bottom }}>
      <CalendarCellContext.Provider value={contextValue}>
        <ResponsiveHeatMap
          data={series}
          margin={MARGIN}
          layers={["axes", "cells"]}
          cellComponent={CalendarCell}
          tooltip={CalendarTooltip}
          colors={colors}
          emptyColor="var(--viz-null)"
          borderColor="var(--viz-cell-outline)"
          labelTextColor="var(--color-text-primary)"
          enableLabels={false}
          xInnerPadding={CELL_PADDING}
          yInnerPadding={CELL_PADDING}
          axisTop={{ tickSize: 0, tickPadding: 8 }}
          axisLeft={{ tickSize: 0, tickPadding: 8 }}
          axisRight={null}
          axisBottom={null}
          hoverTarget="cell"
          inactiveOpacity={1}
          animate={false}
          theme={THEME}
          role="group"
          ariaLabel={`Burning calendar: ${CALENDAR_UNIT}, ${MONTHS_SHORT[0]} to ${MONTHS_SHORT[11]}, by year`}
        />
      </CalendarCellContext.Provider>
    </div>
  );

  return (
    <div className="calendar">
      {dataset.synthetic && (
        <p className="calendar-notice">
          <Badge kind="simulated" /> Synthetic numbers, for building the screen. They are not results.
        </p>
      )}
      {!dataset.synthetic && (
        <p className="calendar-notice">
          {`Data ${dataset.firstYear}–${dataset.lastYear}, model ${dataset.modelVersion}`}
          {dataset.cells !== null && `, ${dataset.cells.toLocaleString("en-US")} cells`}
          {refreshing && ". Updating…"}
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
      <Legend mode="sequential" unit={CALENDAR_UNIT} minLabel={formatCount(range.min)} maxLabel={formatCount(range.max)} />
    </div>
  );
}

/** Year x month heatmap of hotspot detections (task D4): loading, error, empty and ready states. */
export function BurningCalendar() {
  const [state] = useDashboard();
  const [load, reload] = useCalendarDataset(state.area, state.period);

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
