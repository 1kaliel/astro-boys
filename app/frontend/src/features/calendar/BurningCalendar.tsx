import { ResponsiveHeatMap, type ComputedCell, type TooltipProps } from "@nivo/heatmap";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { SegmentedControl, type SegmentOption } from "../../components/ui/SegmentedControl";
import { YearSelect } from "../../components/ui/YearSelect";
import { ChartTableTabs } from "../../components/ui/ChartTableTabs";
import { rawView, type CalendarDataset } from "../../data/calendarSource";
import type { CalendarLoad } from "../../data/useCalendar";
import { anomalyColor, anomalyLegend, anomalyStep } from "../../lib/charts";
import { formatCount } from "../../lib/format";
import { FIRST_YEAR, LAST_YEAR, useDashboard, type Period } from "../../state/dashboard";
import { CalendarAxes, CalendarCell, CalendarCellContext, CalendarDefs } from "./CalendarCell";
import { AnomalyLegend, CalendarLegend } from "./CalendarLegend";
import { CalendarTable } from "./CalendarTable";
import { CalendarKey } from "./CalendarLegend";
import { CalendarFilterPanel } from "./CalendarFilterPanel";
import { countMatches, latestMonthIndex, passesFilters } from "./calendarFilters";
import { SkylineTab } from "./SkylineTab";
import { MonthFilter } from "./MonthFilter";
import {
  anomalyText,
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
const RAW_UNIT = "Native hotspot detections per month, counted by the month's source satellite (not harmonized)";
const ANOMALY_UNIT = "Robust z-score of the month against the median of that month of the year";

// Chart geometry in pixels (nivo needs numbers; colors and strokes come from tokens in calendar.css).
const ROW_PX = 26;
const MARGIN = { top: 30, right: 4, bottom: 4, left: 44 };
const MIN_CELL_PX = 40; // below this width the grid scrolls sideways instead of squeezing the labels
const MAX_CELL_PX = 110; // wide page: cells fill the card, but with few months they stop growing instead of long bars

const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
const PERIOD_OPTIONS: ReadonlyArray<SegmentOption<Period>> = [
  { value: "ALL", label: "All" },
  { value: "D", label: "Day" },
  { value: "N", label: "Night" },
];

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
              <strong>{formatCount(entry.count)}</strong> {entry.rawView ? "native detections" : "hotspot detections"}
            </p>
          )}
          {anomalyText(entry) && <p>{anomalyText(entry)}</p>}
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

  // "Raw by sensor" shows the native count of each month's source satellite instead of the harmonized count.
  const raw = state.scale === "raw";
  // Anomalies belong to the harmonized series: the raw view has none.
  const anomaly = state.metric === "anomaly" && !raw;
  const months = useMemo(() => (raw ? rawView(dataset.months) : dataset.months), [dataset, raw]);

  // Every month of the years shown: the "Peak" shortcut is found here, so it does not move with the filter.
  const fullSeries = useMemo(
    () => buildSeries(months, period, startYear, endYear),
    [months, period, startYear, endYear],
  );
  const peak = useMemo(() => peakSeason(fullSeries), [fullSeries]);
  const series = useMemo(
    () => buildSeries(months, period, startYear, endYear, state.months),
    [months, period, startYear, endYear, state.months],
  );
  // The colors are recomputed for what is on screen, so a season filter uses the whole ramp.
  const scale = useMemo(
    () => buildScale(series.flatMap((row) => row.data.flatMap((cell) => (cell.y === null ? [] : [cell.y])))),
    [series],
  );
  // The filters mask months without moving them. The scale above is built from the unmasked series, so the limits of
  // the colors stay put while the user picks colors or ranges.
  const filters = state.filters;
  const matchContext = useMemo(() => ({ scale, anomaly }), [scale, anomaly]);
  const maskedSeries = useMemo(
    (): CalendarSerie[] =>
      series.map((row) => ({
        ...row,
        data: row.data.map((cell) => ({ ...cell, filtered: !passesFilters(cell, filters, matchContext) })),
      })),
    [series, filters, matchContext],
  );
  const matches = useMemo(() => countMatches(series, filters, matchContext), [series, filters, matchContext]);
  const latest = useMemo(() => latestMonthIndex(dataset.months), [dataset.months]);
  // Picked colors belong to the scale they were picked on: a new scale (area, period, series) starts clean.
  const scaleKey = scale ? `${scale.breaks.join(",")}|${scale.min}|${scale.max}` : "";
  useEffect(() => {
    dispatch({ type: "setLegend", steps: [] });
  }, [scaleKey, dispatch]);
  const onSelect = useCallback((year: number, month: number) => dispatch({ type: "select", year, month }), [dispatch]);

  const selectedHasData = state.selected
    ? maskedSeries.some((row) =>
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
      if (anomaly) {
        // A month with a count and no comparison (partial, or too few years) stays neutral.
        const z = cell.data.entry?.anomalyZ;
        return z == null ? "var(--viz-null)" : anomalyColor(anomalyStep(z));
      }
      if (cell.value === 0) return "var(--cal-zero)";
      return `var(--viz-seq-${scaleStep(cell.value, scale)})`;
    },
    [scale, anomaly],
  );

  // Intervals of an area are approximate; say so where the interval is shown and once above the chart.
  const tooltip = useCallback(
    (props: TooltipProps<CalendarDatum>) => <CalendarTooltip {...props} approximate={dataset.intervalApproximate} />,
    [dataset.intervalApproximate],
  );
  // The raw view has no intervals: they belong to the harmonized estimates.
  const showsIntervals =
    !raw && dataset.intervalApproximate && dataset.months.some((m) => m.isEstimated && m.ciLow !== null);

  // The calendar's own filters sit beside it: year range, months of the year and time of day. They are the same
  // shared state the KPI row, the map and the charts follow.
  const legendLabels = anomaly
    ? anomalyLegend()
        .filter((item) => filters.legend.includes(item.step))
        .map((item) => item.label)
    : scale
      ? legendRanges(scale)
          .filter((range) => filters.legend.includes(range.step))
          .map((range) => range.label)
      : [];
  const hiddenSelected =
    state.selected &&
    maskedSeries.some((row) =>
      row.data.some((c) => c.filtered && c.year === state.selected?.year && c.month === state.selected.month),
    )
      ? state.selected
      : null;
  const side = (
    <aside className="calendar-side" aria-label="Calendar filters">
      <div className="calendar-years">
        <YearSelect
          label="From year"
          value={state.startYear}
          years={YEARS}
          onChange={(startYear) => dispatch({ type: "setYears", startYear, endYear: state.endYear })}
        />
        <YearSelect
          label="To year"
          value={state.endYear}
          years={YEARS}
          onChange={(endYear) => dispatch({ type: "setYears", startYear: state.startYear, endYear })}
        />
      </div>
      <MonthFilter months={state.months} peak={peak} onChange={(months) => dispatch({ type: "setMonths", months })} />
      <SegmentedControl
        label="Time of day"
        options={PERIOD_OPTIONS}
        value={state.period}
        onChange={(next) => dispatch({ type: "setPeriod", period: next })}
      />
      <CalendarFilterPanel
        latest={latest}
        firstYear={dataset.firstYear}
        deviationAvailable={!raw}
        matches={matches}
        legendLabels={legendLabels}
        hiddenSelected={hiddenSelected}
        unit={raw ? RAW_UNIT : CALENDAR_UNIT}
      />
      <CalendarKey
        picked={filters.legend}
        onPick={(steps) => dispatch({ type: "setLegend", steps })}
        ranges={scale ? legendRanges(scale) : []}
        anomaly={anomaly}
        unit={anomaly ? ANOMALY_UNIT : raw ? RAW_UNIT : CALENDAR_UNIT}
      />
    </aside>
  );

  if (!scale) {
    return (
      <div className="calendar" data-palette={state.palette}>
        {side}
        <div className="calendar-body">
          <p className="calendar-status" role="status">
            No hotspot data for this selection. Try another time of day, other months or a wider range of years.
          </p>
        </div>
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
            data={maskedSeries}
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
            ariaLabel={`Burning calendar: ${raw ? RAW_UNIT : CALENDAR_UNIT}, ${monthShort(1)} to ${monthShort(12)}, by year`}
          />
        </CalendarCellContext.Provider>
      </div>
    </div>
  );

  return (
    <div className="calendar" data-palette={state.palette}>
      {side}
      <div className="calendar-body">
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
            Intervals for an area are approximate: the errors of nearby cells are correlated, so the interval of the sum
            is widened (variance sum × n<sup>0.32</sup>).
          </p>
        )}
        {raw && (
          <p className="calendar-notice">
            <strong>Raw by sensor:</strong> each month shows the native count of its source satellite, Aqua MODIS until
            January 2012 and VIIRS after. The two instruments do not count the same way, so the jump in 2012 is the
            change of sensor, not a change in fire activity. Switch to Harmonized to compare years.
            {state.metric === "anomaly" && " Anomalies are computed on the harmonized series only."}
          </p>
        )}
        {anomaly && (
          <p className="calendar-notice">
            <strong>Anomaly:</strong> each month is colored by how far it is from the median of that month of the year
            (robust z-score). It says how unusual a month was; it is not a probability of fire and not a forecast.
          </p>
        )}
        <ChartTableTabs
          label="Burning calendar"
          chart={chart}
          table={<CalendarTable series={maskedSeries} unit={raw ? RAW_UNIT : CALENDAR_UNIT} />}
          extra={{ name: "Skyline", panel: <SkylineTab /> }}
        />
        {anomaly ? (
          <AnomalyLegend unit={ANOMALY_UNIT} />
        ) : (
          <CalendarLegend ranges={legendRanges(scale)} unit={raw ? RAW_UNIT : CALENDAR_UNIT} />
        )}
      </div>
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
