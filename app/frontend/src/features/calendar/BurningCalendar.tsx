import { ResponsiveHeatMap, type ComputedCell, type TooltipProps } from "@nivo/heatmap";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ChartTableTabs } from "../../components/ui/ChartTableTabs";
import { ImageDownload, TextDownload } from "../../components/ui/DownloadBar";
import { rawView, type CalendarDataset } from "../../data/calendarSource";
import type { CalendarLoad } from "../../data/useCalendar";
import { anomalyColor, anomalyStep } from "../../lib/charts";
import {
  areaText,
  calendarCsv,
  exportFileName,
  periodText,
  SOURCE_TEXT,
  type ExportMeta,
} from "../../lib/exportFile";
import { formatCount } from "../../lib/format";
import { useMediaQuery } from "../../lib/hooks";
import { useDashboard } from "../../state/dashboard";
import { CalendarAxes, CalendarCell, CalendarCellContext, CalendarDefs } from "./CalendarCell";
import { AnomalyLegend, CalendarLegend } from "./CalendarLegend";
import { CalendarTable } from "./CalendarTable";
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
// On a phone the 12 months fit the card (no sideways scroll, so the year labels stay in view): compact cells, with
// one-letter month labels (CalendarAxes). The design system's phone size for heatmap cells is 18 px.
const MIN_CELL_PX_PHONE = 20;
const PHONE = "(max-width: 30rem)";
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
  const phone = useMediaQuery(PHONE);
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
  const unit = raw ? RAW_UNIT : CALENDAR_UNIT;
  const shownYears = `${series[0]?.id ?? startYear}-${series[series.length - 1]?.id ?? endYear}`;
  const exportMeta: ExportMeta = {
    title: anomaly ? "Burning calendar: anomaly" : "Burning calendar",
    unit: anomaly ? ANOMALY_UNIT : unit,
    series: raw
      ? "Raw by sensor: native count of each month's source satellite (Aqua MODIS until January 2012; VIIRS after). Not harmonized."
      : "Harmonized: VIIRS-equivalent hotspot detections; months before February 2012 are estimated from MODIS.",
    area: areaText(state.area),
    period: `${periodText(startYear, endYear, period)}${state.months.length > 0 ? `; months: ${monthSpan(state.months)}` : ""}`,
    modelVersion: dataset.modelVersion,
    source: SOURCE_TEXT,
    legend: [
      anomaly
        ? "Colors: robust z-score against the median of that month of the year (not a probability, not a forecast)."
        : `Colors, lightest to darkest: ${legendRanges(scale)
            .map((range) => range.label)
            .join(", ")} detections per month (quantile steps).`,
      "Hatched: no data. Dot: estimated from MODIS. Corner mark: partial month.",
    ],
  };
  const csvRows = series.map((row) => ({
    year: Number(row.id),
    cells: row.data.map((cell) => ({
      month: cell.month,
      label: cell.x,
      count: cell.y,
      ciLow: cell.entry?.ciLow ?? null,
      ciHigh: cell.entry?.ciHigh ?? null,
      estimated: cell.entry?.isEstimated ?? false,
      partial: cell.entry?.isPartial ?? false,
      sourceSatellite: cell.entry?.sourceSatellite ?? null,
      hasData: Boolean(cell.entry),
    })),
  }));
  const chart = (
    <>
    <div className="calendar-scroll">
      <div
        className="calendar-chart"
        style={{
          height: series.length * ROW_PX + MARGIN.top + MARGIN.bottom,
          minWidth: MARGIN.left + MARGIN.right + columns * (phone ? MIN_CELL_PX_PHONE : MIN_CELL_PX),
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
            ariaLabel={`Burning calendar: ${raw ? RAW_UNIT : CALENDAR_UNIT}, ${monthShort(1)} to ${monthShort(12)}, by year`}
          />
        </CalendarCellContext.Provider>
      </div>
    </div>
    <ImageDownload
      meta={exportMeta}
      fileName={(ext) => exportFileName("calendar", [raw ? "raw" : anomaly ? "anomaly" : "harmonized", shownYears, period], ext)}
      svgSelector=".calendar-chart svg"
    />
    </>
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
      <div className="download-bar" role="group" aria-label="Download the calendar table">
        <span className="download-label">Table</span>
        <TextDownload
          label="Download CSV"
          mime="text/csv"
          fileName={exportFileName("calendar", [raw ? "raw" : "harmonized", shownYears, period], "csv")}
          build={() =>
            calendarCsv(
              csvRows,
              { ...exportMeta, title: "Burning calendar table", unit },
              {
                series: raw ? "raw_by_sensor" : "harmonized",
                timeOfDay: period,
                modelVersion: dataset.modelVersion,
                intervalApproximate: !raw && dataset.intervalApproximate,
              },
            )
          }
        />
      </div>
      <ChartTableTabs label="Burning calendar" chart={chart} table={<CalendarTable series={series} unit={unit} />} />
      {anomaly ? (
        <AnomalyLegend unit={ANOMALY_UNIT} />
      ) : (
        <CalendarLegend ranges={legendRanges(scale)} unit={raw ? RAW_UNIT : CALENDAR_UNIT} />
      )}
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
