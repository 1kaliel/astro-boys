import { useId, useState } from "react";
import { Popover } from "../../components/ui/Popover";
import { SegmentedControl, type SegmentOption } from "../../components/ui/SegmentedControl";
import { YearSelect } from "../../components/ui/YearSelect";
import { sameBounds } from "../../lib/area";
import {
  FIRST_YEAR,
  LAST_YEAR,
  PILOT_BOUNDS,
  useDashboard,
  type DashboardAction,
  type DashboardState,
  type Metric,
  type MinFrp,
  type Period,
  type Relevance,
  type Sensor,
} from "../../state/dashboard";
import "../../styles/filters.css";
import { AreaPicker, describeArea } from "./AreaPicker";
import { DownloadCsv } from "./DownloadCsv";

/** The data series: the harmonized VIIRS-equivalent counts, or the native counts of one instrument family. */
type DataSeries = "harmonized" | "modis" | "viirs";

const DATA_OPTIONS: ReadonlyArray<SegmentOption<DataSeries>> = [
  { value: "harmonized", label: "Harmonized" },
  { value: "modis", label: "MODIS" },
  { value: "viirs", label: "VIIRS" },
];
const PERIOD_OPTIONS: ReadonlyArray<SegmentOption<Period>> = [
  { value: "ALL", label: "All" },
  { value: "D", label: "Day" },
  { value: "N", label: "Night" },
];
const METRIC_OPTIONS: ReadonlyArray<SegmentOption<Metric>> = [
  { value: "count", label: "Count" },
  { value: "anomaly", label: "Anomaly" },
];
const INTENSITY_OPTIONS: ReadonlyArray<SegmentOption<`${MinFrp}`>> = [
  { value: "0", label: "Any" },
  { value: "10", label: "≥ 10 MW" },
  { value: "50", label: "≥ 50 MW" },
  { value: "100", label: "≥ 100 MW" },
];
const RELEVANCE_OPTIONS: ReadonlyArray<SegmentOption<Relevance>> = [
  { value: "l", label: "All" },
  { value: "n", label: "Nominal+" },
  { value: "h", label: "High only" },
];
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

/** Same as the reducer's initial years (state/dashboard.tsx): the last 10 years. */
const DEFAULT_START_YEAR = LAST_YEAR - 9;

const PERIOD_TEXT: Record<Period, string> = { ALL: "Day and night", D: "Day only", N: "Night only" };
const RELEVANCE_TEXT: Record<Relevance, string> = { l: "All confidence", n: "Nominal or high confidence", h: "High confidence only" };
const SATELLITE: Record<Exclude<Sensor, "harmonized">, string> = {
  aqua: "Aqua",
  terra: "Terra",
  snpp: "S-NPP",
  n20: "NOAA-20",
};

const familyOf = (sensor: Sensor): DataSeries =>
  sensor === "harmonized" ? "harmonized" : sensor === "aqua" || sensor === "terra" ? "modis" : "viirs";

/**
 * The data series as one choice over two pieces of state: the calendar scale and the map layer. Harmonized =
 * scale "harmonized" + layer "harmonized"; MODIS = scale "raw" + a MODIS satellite (Aqua unless Terra is already on
 * the map); VIIRS = scale "raw" + a VIIRS satellite (S-NPP unless NOAA-20). "mixed" when the map layer control set
 * them apart: no option is pressed and the hint says so.
 */
function dataSeriesOf(state: Pick<DashboardState, "scale" | "sensor">): DataSeries | "mixed" {
  const family = familyOf(state.sensor);
  if (family === "harmonized") return state.scale === "harmonized" ? "harmonized" : "mixed";
  return state.scale === "raw" ? family : "mixed";
}

function setDataSeries(series: DataSeries, sensor: Sensor, dispatch: (action: DashboardAction) => void) {
  if (series === "harmonized") {
    dispatch({ type: "setScale", scale: "harmonized" });
    dispatch({ type: "setSensor", sensor: "harmonized" });
    return;
  }
  dispatch({ type: "setScale", scale: "raw" });
  if (familyOf(sensor) !== series) dispatch({ type: "setSensor", sensor: series === "modis" ? "aqua" : "snpp" });
}

const DATA_HINT: Record<DataSeries | "mixed", string> = {
  harmonized: "VIIRS-equivalent counts, comparable from 2002 to today.",
  modis: "Raw: native counts, not comparable across sensors.",
  viirs: "Raw: native counts, not comparable across sensors.",
  mixed: "Calendar and map show different series: pick one.",
};

function dataText(state: DashboardState): string {
  const series = dataSeriesOf(state);
  if (series === "harmonized") return "Harmonized (VIIRS-equivalent)";
  if (series === "mixed") return "Mixed series";
  return `${series === "modis" ? "MODIS" : "VIIRS"} raw · ${SATELLITE[state.sensor as Exclude<Sensor, "harmonized">]}`;
}

type ActiveFilter = { key: string; text: string; changed: boolean; clear?: () => void };

/** Every filter as a chip, default or not; `changed` ones can be cleared one by one. */
function activeFilters(state: DashboardState, dispatch: (action: DashboardAction) => void): ActiveFilter[] {
  const area = describeArea(state.area, state.areaLabel);
  const yearsChanged = state.startYear !== DEFAULT_START_YEAR || state.endYear !== LAST_YEAR;
  const series = dataSeriesOf(state);
  const chips: ActiveFilter[] = [
    {
      key: "area",
      text: area.text,
      changed: !sameBounds(state.area, PILOT_BOUNDS),
      clear: () => dispatch({ type: "setArea", area: PILOT_BOUNDS, label: null }),
    },
    {
      key: "years",
      text: state.startYear === state.endYear ? `${state.startYear}` : `${state.startYear}–${state.endYear}`,
      changed: yearsChanged,
      clear: () => dispatch({ type: "setYears", startYear: DEFAULT_START_YEAR, endYear: LAST_YEAR }),
    },
    {
      key: "data",
      text: dataText(state),
      changed: series !== "harmonized",
      clear: () => setDataSeries("harmonized", state.sensor, dispatch),
    },
    {
      key: "period",
      text: PERIOD_TEXT[state.period],
      changed: state.period !== "ALL",
      clear: () => dispatch({ type: "setPeriod", period: "ALL" }),
    },
  ];
  if (state.minFrp > 0)
    chips.push({
      key: "frp",
      text: `≥ ${state.minFrp} MW`,
      changed: true,
      clear: () => dispatch({ type: "setMinFrp", minFrp: 0 }),
    });
  if (state.relevance !== "l")
    chips.push({
      key: "relevance",
      text: RELEVANCE_TEXT[state.relevance],
      changed: true,
      clear: () => dispatch({ type: "setRelevance", relevance: "l" }),
    });
  if (state.metric !== "count")
    chips.push({
      key: "metric",
      text: "Calendar: anomaly",
      changed: true,
      clear: () => dispatch({ type: "setMetric", metric: "count" }),
    });
  return chips;
}

/**
 * Global filters, under the header: they drive the KPIs, the calendar and the map. Geography (Region → Country →
 * State), years, data series and time of day stay in view; intensity, relevance and the calendar metric sit behind
 * "More filters". A row of chips says what is applied, with Reset. Under 56rem the controls fold into one
 * "Filters · N active" button; the chips stay visible.
 */
export function FilterBar() {
  const [state, dispatch] = useDashboard();
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();
  const hintId = useId();

  const chips = activeFilters(state, dispatch);
  const active = chips.filter((chip) => chip.changed).length;
  const series = dataSeriesOf(state);

  function resetAll() {
    for (const chip of chips) if (chip.changed) chip.clear?.();
  }

  return (
    <section className="fbar" data-tour="filters" aria-label="Filters for every view">
      <button
        type="button"
        className="button fbar-toggle"
        aria-expanded={panelOpen}
        aria-controls={panelId}
        onClick={() => setPanelOpen((open) => !open)}
      >
        <span>
          Filters
          {active > 0 ? (
            <>
              {" · "}
              <span className="fbar-toggle-count">{active} active</span>
            </>
          ) : null}
        </span>
        <span className="fbar-toggle-icon" aria-hidden="true">
          ▾
        </span>
      </button>

      <div id={panelId} className="fbar-panel" data-open={panelOpen || undefined}>
        <AreaPicker
          area={state.area}
          areaLabel={state.areaLabel}
          onArea={(area, label) => dispatch({ type: "setArea", area, label })}
        />

        <div className="fbar-group" role="group" aria-label="Years">
          <div className="control">
            <span className="control-label" aria-hidden="true">
              Years
            </span>
            <div className="filter-years">
              <YearSelect
                label="From year"
                hideLabel
                value={state.startYear}
                years={YEARS}
                onChange={(startYear) => dispatch({ type: "setYears", startYear, endYear: state.endYear })}
              />
              <span className="filter-years-dash" aria-hidden="true">
                –
              </span>
              <YearSelect
                label="To year"
                hideLabel
                value={state.endYear}
                years={YEARS}
                onChange={(endYear) => dispatch({ type: "setYears", startYear: state.startYear, endYear })}
              />
            </div>
          </div>
        </div>

        <div className="fbar-group fbar-data">
          <SegmentedControl
            label="Data"
            options={DATA_OPTIONS}
            value={series === "mixed" ? ("mixed" as DataSeries) : series}
            onChange={(next) => setDataSeries(next, state.sensor, dispatch)}
          />
          <p className="fbar-note" id={hintId} data-tone={series === "mixed" ? "warn" : undefined}>
            {DATA_HINT[series]}
          </p>
        </div>

        <div className="fbar-group">
          <SegmentedControl
            label="Time of day"
            options={PERIOD_OPTIONS}
            value={state.period}
            onChange={(period) => dispatch({ type: "setPeriod", period })}
          />
        </div>

        <div className="fbar-group fbar-tail">
          <MoreFilters
            metric={state.metric}
            minFrp={state.minFrp}
            relevance={state.relevance}
            onMetric={(metric) => dispatch({ type: "setMetric", metric })}
            onMinFrp={(minFrp) => dispatch({ type: "setMinFrp", minFrp })}
            onRelevance={(relevance) => dispatch({ type: "setRelevance", relevance })}
          />
        </div>
      </div>

      <div className="fbar-active">
        <span className="fbar-active-label" id={`${panelId}-chips`}>
          Showing
        </span>
        <ul className="fbar-chips" aria-labelledby={`${panelId}-chips`}>
          {chips.map((chip) => (
            <li key={chip.key} className="fbar-chip" data-changed={chip.changed || undefined}>
              <span className="fbar-chip-text">{chip.text}</span>
              {chip.changed && chip.clear && (
                <button type="button" className="fbar-chip-clear" aria-label={`Clear filter: ${chip.text}`} onClick={chip.clear}>
                  <span aria-hidden="true">×</span>
                </button>
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="fbar-reset" onClick={resetAll} disabled={active === 0}>
          Reset
        </button>
        {/* An action on the filtered view, not a filter: next to the chips, in view on a phone too. */}
        <div className="fbar-download">
          <DownloadCsv />
        </div>
      </div>
    </section>
  );
}

/**
 * Everything that is not an everyday filter: the calendar metric, and the intensity (FRP) and relevance
 * (confidence) of the native detections, which only the drill-down, the counts and the CSV carry (the harmonized
 * calendar and the L2 map have neither field). The button counts what is changed from the default.
 */
function MoreFilters({
  metric,
  minFrp,
  relevance,
  onMetric,
  onMinFrp,
  onRelevance,
}: {
  metric: Metric;
  minFrp: MinFrp;
  relevance: Relevance;
  onMetric: (metric: Metric) => void;
  onMinFrp: (minFrp: MinFrp) => void;
  onRelevance: (relevance: Relevance) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = [metric !== "count", minFrp > 0, relevance !== "l"].filter(Boolean).length;
  return (
    <div className="control">
      <span className="control-label" aria-hidden="true">
        Detections
      </span>
      <Popover
        open={open}
        onOpenChange={setOpen}
        triggerLabel={`More filters${active > 0 ? `, ${active} changed` : ""}`}
        title="More filters"
        trigger={
          <>
            More filters{active > 0 && <span className="filter-count">{active}</span>}
            <span className="chip-icon" aria-hidden="true">
              ▾
            </span>
          </>
        }
      >
        <SegmentedControl label="Calendar shows" options={METRIC_OPTIONS} value={metric} onChange={onMetric} />
        <SegmentedControl
          label="Intensity (fire radiative power)"
          options={INTENSITY_OPTIONS}
          value={`${minFrp}`}
          onChange={(value) => onMinFrp(Number(value) as MinFrp)}
        />
        <SegmentedControl label="Relevance (confidence class)" options={RELEVANCE_OPTIONS} value={relevance} onChange={onRelevance} />
        <p className="area-summary">
          Intensity and relevance apply to the native detections: the sub-cells of the map, the detection count and the
          CSV. The harmonized calendar and the 0.25° cells carry neither field, so they do not change.
        </p>
      </Popover>
    </div>
  );
}
