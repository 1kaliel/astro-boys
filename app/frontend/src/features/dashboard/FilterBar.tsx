import { useEffect, useId, useState } from "react";
import { Button } from "../../components/ui/Button";
import { CoordinateField } from "../../components/ui/CoordinateField";
import { Popover } from "../../components/ui/Popover";
import { SegmentedControl, type SegmentOption } from "../../components/ui/SegmentedControl";
import { YearSelect } from "../../components/ui/YearSelect";
import { formatDegrees, formatSizeKm, previewBounds, sameBounds } from "../../lib/area";
import { cellsInBounds, type Bounds } from "../../lib/grid";
import {
  FIRST_YEAR,
  LAST_YEAR,
  PILOT_BOUNDS,
  useDashboard,
  type Metric,
  type MinFrp,
  type Relevance,
  type Period,
  type Scale,
} from "../../state/dashboard";
import { DownloadCsv } from "./DownloadCsv";

const PERIOD_OPTIONS: ReadonlyArray<SegmentOption<Period>> = [
  { value: "ALL", label: "All" },
  { value: "D", label: "Day" },
  { value: "N", label: "Night" },
];
const SCALE_OPTIONS: ReadonlyArray<SegmentOption<Scale>> = [
  { value: "harmonized", label: "Harmonized" },
  { value: "raw", label: "Raw by sensor" },
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

// 2 x 2: the two longitudes, then the two latitudes. The fields take any coordinate; the preview says when an edge
// is outside the study area and will be clamped to it (a field that clamps on its own would do it silently).
const FIELDS: ReadonlyArray<{ key: keyof Bounds; label: string; min: number; max: number }> = [
  { key: "west", label: "West (lon)", min: -180, max: 180 },
  { key: "east", label: "East (lon)", min: -180, max: 180 },
  { key: "south", label: "South (lat)", min: -90, max: 90 },
  { key: "north", label: "North (lat)", min: -90, max: 90 },
];

const boundsText = (b: Bounds) =>
  `W ${formatDegrees(b.west)}, S ${formatDegrees(b.south)}, E ${formatDegrees(b.east)}, N ${formatDegrees(b.north)}`;

/**
 * The essentials stay in view (area, years, time of day); the rest sits behind "More filters". On a phone the bar
 * is two columns and four short rows instead of one control per line, so the content starts on the first screen.
 */
export function FilterBar() {
  const [state, dispatch] = useDashboard();
  return (
    <div className="filter-bar" role="group" aria-label="Filters for every view">
      <AreaFilter area={state.area} onArea={(area) => dispatch({ type: "setArea", area })} />
      <div className="control filter-wide" role="group" aria-label="Years">
        <span className="control-label">Years</span>
        <div className="filter-years">
          <YearSelect
            label="From"
            hideLabel
            value={state.startYear}
            years={YEARS}
            onChange={(startYear) => dispatch({ type: "setYears", startYear, endYear: state.endYear })}
          />
          <span className="filter-years-dash" aria-hidden="true">
            –
          </span>
          <YearSelect
            label="To"
            hideLabel
            value={state.endYear}
            years={YEARS}
            onChange={(endYear) => dispatch({ type: "setYears", startYear: state.startYear, endYear })}
          />
        </div>
      </div>
      <div className="filter-wide">
        <SegmentedControl
          label="Time of day"
          options={PERIOD_OPTIONS}
          value={state.period}
          onChange={(period) => dispatch({ type: "setPeriod", period })}
        />
      </div>
      <MoreFilters
        scale={state.scale}
        metric={state.metric}
        minFrp={state.minFrp}
        relevance={state.relevance}
        onScale={(scale) => dispatch({ type: "setScale", scale })}
        onMetric={(metric) => dispatch({ type: "setMetric", metric })}
        onMinFrp={(minFrp) => dispatch({ type: "setMinFrp", minFrp })}
        onRelevance={(relevance) => dispatch({ type: "setRelevance", relevance })}
      />
      <DownloadCsv />
    </div>
  );
}

/**
 * Everything that is not an everyday filter: the calendar scale and metric, and the intensity (FRP) and relevance
 * (confidence) of the native detections, which only the drill-down, the counts and the CSV carry (the harmonized
 * calendar and the L2 map have neither field). The button counts what is changed from the default.
 */
function MoreFilters({
  scale,
  metric,
  minFrp,
  relevance,
  onScale,
  onMetric,
  onMinFrp,
  onRelevance,
}: {
  scale: Scale;
  metric: Metric;
  minFrp: MinFrp;
  relevance: Relevance;
  onScale: (scale: Scale) => void;
  onMetric: (metric: Metric) => void;
  onMinFrp: (minFrp: MinFrp) => void;
  onRelevance: (relevance: Relevance) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = [scale !== "harmonized", metric !== "count", minFrp > 0, relevance !== "l"].filter(Boolean).length;
  return (
    <div className="control">
      <span className="control-label">Filters</span>
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
        <SegmentedControl label="Scale" options={SCALE_OPTIONS} value={scale} onChange={onScale} />
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

function AreaFilter({ area, onArea }: { area: Bounds; onArea: (area: Bounds) => void }) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Bounds>(area);

  useEffect(() => setFields(area), [area]);

  const cells = cellsInBounds(area).length;
  const summary = `${sameBounds(area, PILOT_BOUNDS) ? "Northeast Brazil (study area)" : "Custom area"} · ${cells.toLocaleString(
    "en-US",
  )} L2 cells`;
  // What the typed box would select, shown before it is applied.
  const preview = previewBounds(fields, PILOT_BOUNDS);
  const [tried, setTried] = useState(false);

  function apply(candidate: Bounds) {
    const check = previewBounds(candidate, PILOT_BOUNDS);
    if (check.errors.length) {
      setTried(true);
      return;
    }
    onArea(check.area);
    setOpen(false);
  }

  return (
    <div className="control filter-wide">
      <span className="control-label">Area</span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setFields(area);
            setTried(false);
          }
        }}
        triggerLabel={`Area: ${summary}. Edit the area`}
        title="Area: every 0.25° (L2) cell that overlaps the box is counted"
        trigger={
          <>
            {summary}
            <span className="chip-icon" aria-hidden="true">
              ▾
            </span>
          </>
        }
      >
        <form
          id={formId}
          className="area-form"
          onSubmit={(event) => {
            event.preventDefault();
            apply(fields);
          }}
        >
          {FIELDS.map((field) => (
            <CoordinateField
              key={field.key}
              label={field.label}
              value={fields[field.key]}
              min={field.min}
              max={field.max}
              onChange={(value) => setFields((current) => ({ ...current, [field.key]: value }))}
            />
          ))}
        </form>
        <div className="area-preview" aria-live="polite">
          {preview.errors.length === 0 ? (
            <>
              Selects <strong>{preview.cells.toLocaleString("en-US")} L2 cells</strong>,{" "}
              {formatSizeKm(preview.widthKm, preview.heightKm)}.
              {preview.clamped && ` Outside the study area: clamped to ${boundsText(preview.area)}.`}
            </>
          ) : (
            <ul className={tried ? "area-errors area-error" : "area-errors"} role={tried ? "alert" : undefined}>
              {preview.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>
        <p className="area-summary">
          Study area, the only place with data: {boundsText(PILOT_BOUNDS)}. On the map you can also draw a rectangle or
          use the visible area.
        </p>
        <div className="card-actions">
          <Button type="submit" form={formId}>
            Apply
          </Button>
          <Button onClick={() => apply(PILOT_BOUNDS)}>Reset to the study area</Button>
        </div>
      </Popover>
    </div>
  );
}
