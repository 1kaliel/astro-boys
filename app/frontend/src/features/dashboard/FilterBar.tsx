import { useId, useState, type ReactNode } from "react";
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
import {
  DATA_SERIES,
  DATA_SERIES_HINT,
  DATA_SERIES_LABEL,
  dataSeriesActions,
  dataSeriesOf,
  isMixed,
  type DataSeries,
} from "../../lib/dataSeries";
import "../../styles/filters.css";
import { AreaPicker, describeArea } from "./AreaPicker";

const DATA_OPTIONS: ReadonlyArray<SegmentOption<DataSeries>> = DATA_SERIES.map((value) => ({
  value,
  label: DATA_SERIES_LABEL[value].short,
}));
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

/** Same as the reducer's initial years (state/dashboard.tsx): all years. */
const DEFAULT_START_YEAR = FIRST_YEAR;

const PERIOD_TEXT: Record<Period, string> = { ALL: "Day and night", D: "Day only", N: "Night only" };
const RELEVANCE_TEXT: Record<Relevance, string> = { l: "All confidence", n: "Nominal or high confidence", h: "High confidence only" };
const SATELLITE: Record<Exclude<Sensor, "harmonized">, string> = {
  aqua: "Aqua",
  terra: "Terra",
  snpp: "S-NPP",
  n20: "NOAA-20",
};

function setDataSeries(series: DataSeries, sensor: Sensor, dispatch: (action: DashboardAction) => void) {
  for (const action of dataSeriesActions(series, sensor)) dispatch(action);
}

function dataText(state: DashboardState): string {
  const series = dataSeriesOf(state);
  if (series === "harmonized") return DATA_SERIES_LABEL.harmonized.long;
  return `${DATA_SERIES_LABEL[series].long} · ${SATELLITE[state.sensor as Exclude<Sensor, "harmonized">]}`;
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
      changed: series !== "harmonized" || isMixed(state),
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
 * The sidebar steps of the explorer, a sequence: 1 Where (the area), 2 When (the month, given by the page, and the
 * years of the period), 3 What (data series, time of day, more filters). They drive the map, the numbers, the days
 * and the timeline. On a phone the list folds behind one button; the month stays in view outside it.
 */
export function FilterBar({
  when,
  collapsible,
  summary,
}: {
  when?: ReactNode;
  collapsible?: boolean;
  /** One line said by the folded toggle on a phone, e.g. "Northeast · Sep 2025 · Harmonized". */
  summary?: string;
}) {
  const [state, dispatch] = useDashboard();
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();
  const hintId = useId();

  const chips = activeFilters(state, dispatch);
  const active = chips.filter((chip) => chip.changed).length;
  const series = dataSeriesOf(state);
  const mixed = isMixed(state);
  const folded = Boolean(collapsible) && !panelOpen;

  function resetAll() {
    for (const chip of chips) if (chip.changed) chip.clear?.();
  }

  return (
    <section className="xp-steps" data-tour="filters" aria-label="Area, month and data">
      {collapsible && (
        <button
          type="button"
          className="button xp-steps-toggle"
          aria-expanded={panelOpen}
          aria-controls={panelId}
          onClick={() => setPanelOpen((open) => !open)}
        >
          <span>
            {summary ?? "Change area, years or data"}
            {active > 0 ? <span className="fbar-toggle-count">{` · ${active} changed`}</span> : null}
          </span>
          <span className="fbar-toggle-icon" aria-hidden="true">
            ▾
          </span>
        </button>
      )}
      <ol id={panelId} className="xp-step-list" hidden={folded || undefined}>
        <li className="xp-step">
          <h2 className="xp-step-title">
            <span className="xp-step-n" aria-hidden="true">
              1
            </span>
            Where
          </h2>
          <AreaPicker
            area={state.area}
            areaLabel={state.areaLabel}
            onArea={(area, label) => dispatch({ type: "setArea", area, label })}
          />
        </li>

        <li className="xp-step">
          <h2 className="xp-step-title">
            <span className="xp-step-n" aria-hidden="true">
              2
            </span>
            When
          </h2>
          {when}
          <div className="xp-years" role="group" aria-label="Years of the period">
            <span className="control-label">Period of the timeline and the totals</span>
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
        </li>

        <li className="xp-step">
          <h2 className="xp-step-title">
            <span className="xp-step-n" aria-hidden="true">
              3
            </span>
            What
          </h2>
          <div className="xp-row">
            <SegmentedControl
              label="Data"
              options={DATA_OPTIONS}
              value={series}
              onChange={(next) => setDataSeries(next, state.sensor, dispatch)}
            />
          </div>
          <p className="fbar-note fbar-data-hint" id={hintId} data-tone={mixed ? "warn" : undefined}>
            {mixed
              ? "The calendar and the map were out of step: pick a series to set both."
              : `${DATA_SERIES_HINT[series]} Same switch as Data on the map.`}
          </p>
          <div className="xp-row">
            <SegmentedControl
              label="Time of day"
              options={PERIOD_OPTIONS}
              value={state.period}
              onChange={(period) => dispatch({ type: "setPeriod", period })}
            />
            <MoreFilters
              metric={state.metric}
              minFrp={state.minFrp}
              relevance={state.relevance}
              onMetric={(metric) => dispatch({ type: "setMetric", metric })}
              onMinFrp={(minFrp) => dispatch({ type: "setMinFrp", minFrp })}
              onRelevance={(relevance) => dispatch({ type: "setRelevance", relevance })}
            />
          </div>
        </li>
      </ol>
      {active > 0 && !folded && (
        <p className="xp-reset">
          {`${active} ${active === 1 ? "filter" : "filters"} changed: ${chips
            .filter((chip) => chip.changed)
            .map((chip) => chip.text)
            .join(" · ")}. `}
          <button type="button" className="fbar-reset" onClick={resetAll}>
            Reset all
          </button>
        </p>
      )}
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
    <div className="control fbar-more">
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
