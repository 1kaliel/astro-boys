import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { CoordinateField } from "../../components/ui/CoordinateField";
import { Popover } from "../../components/ui/Popover";
import { formatDegrees, formatSizeKm, previewBounds, sameBounds } from "../../lib/area";
import { cellsInBounds, type Bounds } from "../../lib/grid";
import { PILOT_BOUNDS } from "../../state/dashboard";
import {
  COUNTRIES,
  REGIONS,
  STATE_PRESETS,
  STUDY_AREA_LABEL,
  presetArea,
  presetForLabel,
  presetLabel,
  type GeoOption,
} from "./areaPresets";

// 2 x 2: the two longitudes, then the two latitudes. The fields take any coordinate; the preview says when an edge
// is outside the study area and will be clamped to it (a field that clamps on its own would do it silently).
const FIELDS: ReadonlyArray<{ key: keyof Bounds; label: string; min: number; max: number }> = [
  { key: "west", label: "West (lon)", min: -180, max: 180 },
  { key: "east", label: "East (lon)", min: -180, max: 180 },
  { key: "south", label: "South (lat)", min: -90, max: 90 },
  { key: "north", label: "North (lat)", min: -90, max: 90 },
];

const ALL = "all";
const CURRENT = "current";
const CUSTOM = "custom";

export const boundsText = (b: Bounds) =>
  `W ${formatDegrees(b.west)}, S ${formatDegrees(b.south)}, E ${formatDegrees(b.east)}, N ${formatDegrees(b.north)}`;

const cellsText = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "cell" : "cells"}`;

export type AreaKind = "study" | "preset" | "custom";

/** What the area is, in words, for the State select and the active-filter chips. */
export function describeArea(area: Bounds, areaLabel: string | null): { kind: AreaKind; text: string; presetId?: string } {
  const preset = presetForLabel(areaLabel);
  if (preset && sameBounds(presetArea(preset).area, area)) return { kind: "preset", text: presetLabel(preset), presetId: preset.id };
  if (sameBounds(area, PILOT_BOUNDS)) return { kind: "study", text: STUDY_AREA_LABEL };
  const cells = cellsText(cellsInBounds(area).length);
  return { kind: "custom", text: areaLabel ? `${areaLabel} · ${cells}` : `Custom area · ${cells}` };
}

/** Native select: disabled options come for free, and phones open their own picker. */
function GeoSelect({
  label,
  value,
  onChange,
  children,
  wide,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div className={wide ? "control fbar-field fbar-field-wide" : "control fbar-field"}>
      <label className="control-label" htmlFor={id}>
        {label}
      </label>
      <span className="fbar-select-wrap">
        <select id={id} className="fbar-select" value={value} onChange={(event) => onChange?.(event.target.value)}>
          {children}
        </select>
      </span>
    </div>
  );
}

const geoOptions = (options: readonly GeoOption[]) =>
  options.map((option) => (
    <option key={option.id} value={option.id} disabled={!option.enabled}>
      {option.enabled ? option.name : `${option.name} (no data)`}
    </option>
  ));

/**
 * Region → Country → State. Only the Northeast Brazil study box has data, so Region and Country have one live
 * option each; a State is an approximate box. "Custom box…" (and "Edit box") opens typed coordinates; an area drawn
 * on the map shows as "Custom area · N cells".
 */
export function AreaPicker({
  area,
  areaLabel,
  onArea,
}: {
  area: Bounds;
  areaLabel: string | null;
  onArea: (area: Bounds, label: string | null) => void;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Bounds>(area);
  const [tried, setTried] = useState(false);

  useEffect(() => setFields(area), [area]);

  const current = describeArea(area, areaLabel);
  const stateValue = current.kind === "preset" ? current.presetId! : current.kind === "study" ? ALL : CURRENT;
  // What the typed box would select, shown before it is applied.
  const preview = previewBounds(fields, PILOT_BOUNDS);

  function openBox(next: boolean) {
    setOpen(next);
    if (next) {
      setFields(area);
      setTried(false);
    }
  }

  function apply(candidate: Bounds) {
    const check = previewBounds(candidate, PILOT_BOUNDS);
    if (check.errors.length) {
      setTried(true);
      return;
    }
    onArea(check.area, null);
    setOpen(false);
  }

  function pickState(value: string) {
    if (value === CUSTOM) return openBox(true);
    if (value === ALL) return onArea(PILOT_BOUNDS, null);
    const preset = STATE_PRESETS.find((p) => p.id === value);
    if (preset) onArea(presetArea(preset).area, presetLabel(preset));
  }

  return (
    <div className="fbar-group fbar-geo" role="group" aria-label="Area">
      <GeoSelect label="Region" value="south-america">
        {geoOptions(REGIONS)}
      </GeoSelect>
      <GeoSelect label="Country" value="brazil">
        {geoOptions(COUNTRIES)}
      </GeoSelect>
      <div className="fbar-state">
        <GeoSelect label="State" value={stateValue} onChange={pickState} wide>
          <option value={ALL}>{STUDY_AREA_LABEL}</option>
          <optgroup label="States (approximate boxes)">
            {STATE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} ({preset.uf})
              </option>
            ))}
          </optgroup>
          {current.kind === "custom" && <option value={CURRENT}>{current.text}</option>}
          <option value={CUSTOM}>Custom box…</option>
        </GeoSelect>
        <Popover
          open={open}
          onOpenChange={openBox}
          triggerLabel={`Edit the area as a box of coordinates. Now: ${current.text}`}
          title="Custom box: every 0.25° cell that overlaps it is counted"
          trigger={
            <>
              Edit box
              <span className="chip-icon" aria-hidden="true">
                ▾
              </span>
            </>
          }
        >
          <form
            id={formId}
            className="area-form"
            // The fields step by 0.25° from the study edges (-48.8 + 0.25 = -48.55), which the browser's own step
            // check rejects; previewBounds is the validation.
            noValidate
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
                onChange={(value) => setFields((prev) => ({ ...prev, [field.key]: value }))}
              />
            ))}
          </form>
          <div className="area-preview" aria-live="polite">
            {preview.errors.length === 0 ? (
              <>
                Selects <strong>{cellsText(preview.cells)}</strong>, {formatSizeKm(preview.widthKm, preview.heightKm)}.
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
            Study area, the only place with data: {boundsText(PILOT_BOUNDS)}. On the map you can also draw a rectangle
            or use the visible area.
          </p>
          <div className="card-actions">
            <Button type="submit" form={formId}>
              Apply
            </Button>
            <Button onClick={() => apply(PILOT_BOUNDS)}>Reset to the study area</Button>
          </div>
        </Popover>
      </div>
      {current.kind === "preset" && (
        <p className="fbar-note">
          A rectangle around the state, not its border: cells of neighbouring states are included.
        </p>
      )}
    </div>
  );
}
