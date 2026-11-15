import { useEffect, useId, useState } from "react";
import { Button } from "../../components/ui/Button";
import { CoordinateField } from "../../components/ui/CoordinateField";
import { Popover } from "../../components/ui/Popover";
import { SegmentedControl, type SegmentOption } from "../../components/ui/SegmentedControl";
import { checkArea, sameBounds } from "../../lib/area";
import { cellsInBounds, type Bounds } from "../../lib/grid";
import { PILOT_BOUNDS, useDashboard, type Metric, type Scale } from "../../state/dashboard";
import { DownloadCsv } from "./DownloadCsv";
import { EXTENT } from "../../lib/extent";

const SCALE_OPTIONS: ReadonlyArray<SegmentOption<Scale>> = [
  { value: "harmonized", label: "Harmonized" },
  { value: "raw", label: "Raw by sensor" },
];
const METRIC_OPTIONS: ReadonlyArray<SegmentOption<Metric>> = [
  { value: "count", label: "Count" },
  { value: "anomaly", label: "Anomaly" },
];

const FIELDS: ReadonlyArray<{ key: keyof Bounds; label: string; min: number; max: number }> = [
  { key: "west", label: "West (lon)", min: -180, max: 180 },
  { key: "south", label: "South (lat)", min: -90, max: 90 },
  { key: "east", label: "East (lon)", min: -180, max: 180 },
  { key: "north", label: "North (lat)", min: -90, max: 90 },
];

/**
 * One row of filters above the content: area, scale and what the calendar shows. The years, months and time of day
 * live beside the calendar; they feed the same shared state.
 */
export function FilterBar() {
  const [state, dispatch] = useDashboard();
  return (
    <div className="filter-bar" role="group" aria-label="Filters for every view">
      <AreaFilter area={state.area} onArea={(area) => dispatch({ type: "setArea", area })} />
      <SegmentedControl
        label="Scale"
        options={SCALE_OPTIONS}
        value={state.scale}
        onChange={(scale) => dispatch({ type: "setScale", scale })}
      />
      <SegmentedControl
        label="Calendar shows"
        options={METRIC_OPTIONS}
        value={state.metric}
        onChange={(metric) => dispatch({ type: "setMetric", metric })}
      />
      <DownloadCsv />
    </div>
  );
}

function AreaFilter({ area, onArea }: { area: Bounds; onArea: (area: Bounds) => void }) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Bounds>(area);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setFields(area), [area]);

  const cells = cellsInBounds(area).length;
  const summary = `${sameBounds(area, PILOT_BOUNDS) ? EXTENT.id === "brazil" ? "Brazil" : "Northeast Brazil (pilot)" : "Custom area"} · ${cells.toLocaleString(
    "en-US",
  )} L2 cells`;

  function apply(candidate: Bounds) {
    const check = checkArea(candidate, PILOT_BOUNDS);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setError(null);
    onArea(check.area);
    setOpen(false);
  }

  return (
    <div className="control">
      <span className="control-label">Area</span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setFields(area);
            setError(null);
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
        <p className="area-summary">On the map you can also draw a rectangle or use the visible area.</p>
        {error && (
          <p className="area-error" role="alert">
            {error}
          </p>
        )}
        <div className="card-actions">
          <Button className="button-primary" type="submit" form={formId}>
            Apply
          </Button>
          <Button onClick={() => apply(PILOT_BOUNDS)}>{EXTENT.id === "brazil" ? "Reset to Brazil" : "Reset to pilot"}</Button>
        </div>
      </Popover>
    </div>
  );
}
