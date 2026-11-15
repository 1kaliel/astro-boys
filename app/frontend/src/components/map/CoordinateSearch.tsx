import "../../styles/map-search.css";
import { useEffect, useId, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { useRemote } from "../../data/api";
import { sameBounds } from "../../lib/area";
import { cx } from "../../lib/cx";
import type { HotspotsCount } from "../../lib/hotspotsCsv";
import { prefersReducedMotion } from "../../lib/hooks";
import { PILOT_BOUNDS, useDashboard, type PointSearch } from "../../state/dashboard";
import { Button } from "../ui/Button";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";
import {
  DEFAULT_RADIUS_KM,
  RADII_KM,
  checkPoint,
  formatPointCoord,
  monthCountText,
  monthCountUrl,
  parseLatLon,
  pointArea,
  pointLabel,
  type RadiusKm,
} from "./coords";

const RADIUS_OPTIONS: ReadonlyArray<SegmentOption<`${RadiusKm}`>> = RADII_KM.map((km) => ({
  value: `${km}` as `${RadiusKm}`,
  label: `${km} km`,
}));

/** A point picked on the map; `at` makes two picks of the same place distinct. */
export type PickedPoint = { lat: number; lon: number; at: number };

type CoordinateSearchProps = {
  mapRef: RefObject<MapRef | null>;
  /** The month on the map, for the count of native detections. */
  month: { year: number; month: number; label: string } | null;
  /** "Pick on map": while on, a click on the map fills the fields instead of opening a drill-down. */
  picking: boolean;
  onPicking: (picking: boolean) => void;
  picked: PickedPoint | null;
  /** A rectangle is being drawn: picking waits. */
  drawing: boolean;
};

const asRadius = (km: number | undefined): RadiusKm =>
  (RADII_KM as readonly number[]).includes(km ?? -1) ? (km as RadiusKm) : DEFAULT_RADIUS_KM;

/**
 * Search by coordinates (map tools): latitude and longitude, typed, pasted as a pair or picked on the map, and a
 * radius. A point is not a region: Apply selects the box around the circle, clamped to the study area, so the
 * calendar and the KPIs follow. Shows the native detections of that box for the month on the map.
 */
export function CoordinateSearch({ mapRef, month, picking, onPicking, picked, drawing }: CoordinateSearchProps) {
  const [state, dispatch] = useDashboard();
  const point = state.point;
  const [open, setOpen] = useState(point !== null);
  const [latText, setLatText] = useState(point ? formatPointCoord(point.lat) : "");
  const [lonText, setLonText] = useState(point ? formatPointCoord(point.lon) : "");
  const [radius, setRadius] = useState<RadiusKm>(asRadius(point?.radiusKm));
  const [error, setError] = useState<string | null>(null);
  const panelId = useId();
  const latId = useId();
  const lonId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);

  // The fields follow the applied point (e.g. after Clear elsewhere, or when the panel opens again).
  useEffect(() => {
    if (!point) return;
    setLatText(formatPointCoord(point.lat));
    setLonText(formatPointCoord(point.lon));
    setRadius(asRadius(point.radiusKm));
  }, [point]);

  // A click on the map while picking fills the fields; Apply is then one Enter away.
  useEffect(() => {
    if (!picked) return;
    setOpen(true);
    setLatText(formatPointCoord(picked.lat));
    setLonText(formatPointCoord(picked.lon));
    setError(null);
    applyRef.current?.focus({ preventScroll: true });
  }, [picked]);

  const countUrl =
    point && month
      ? monthCountUrl({
          area: state.area,
          year: month.year,
          month: month.month,
          period: state.period,
          minFrp: state.minFrp,
          relevance: state.relevance,
        })
      : null;
  const count = useRemote<HotspotsCount>(countUrl);

  function centerOn(target: { lat: number; lon: number }) {
    mapRef.current?.easeTo({ center: [target.lon, target.lat], duration: prefersReducedMotion() ? 0 : 400 });
  }

  function apply(next: PointSearch): boolean {
    const result = pointArea(next, PILOT_BOUNDS);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    setError(null);
    const unchanged = sameBounds(result.area, state.area);
    dispatch({ type: "setArea", area: result.area, label: pointLabel(next), point: next });
    // A new area frames itself on the map; the same box again only needs the view brought back to it.
    if (unchanged) centerOn(next);
    return true;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const check = checkPoint(latText, lonText, PILOT_BOUNDS);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    onPicking(false);
    apply({ lat: check.lat, lon: check.lon, radiusKm: radius });
  }

  function onRadius(value: `${RadiusKm}`) {
    const km = Number(value) as RadiusKm;
    setRadius(km);
    // With a point applied, a new radius applies at once (the same point).
    if (point) apply({ lat: point.lat, lon: point.lon, radiusKm: km });
  }

  function clear() {
    setLatText("");
    setLonText("");
    setError(null);
    onPicking(false);
    if (point) dispatch({ type: "setArea", area: PILOT_BOUNDS });
  }

  // Pasting "-9.45, -40.2" into either field fills both.
  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pair = parseLatLon(event.clipboardData.getData("text"));
    if (!pair) return;
    event.preventDefault();
    setLatText(formatPointCoord(pair.lat));
    setLonText(formatPointCoord(pair.lon));
    setError(null);
  }

  // Escape stops picking first, then closes the panel (and gives the keyboard back to its button).
  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    if (picking) {
      onPicking(false);
    } else {
      setOpen(false);
      toggleRef.current?.focus();
    }
  }

  const countText = count.data && month ? monthCountText(count.data, month.year, month.month) : null;
  const pointResult = point ? pointArea(point, PILOT_BOUNDS) : null;
  const clamped = pointResult?.ok === true && pointResult.clamped;
  const filtered = state.minFrp > 0 || state.relevance !== "l";

  return (
    <div className={cx("coord-search", open && "is-open")} data-tour="coords">
      <button
        type="button"
        ref={toggleRef}
        className={cx("button", "coord-toggle", point && "has-point")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (open) onPicking(false);
          setOpen(!open);
        }}
      >
        <svg className="coord-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
          <path d="M8 0.5v3M8 12.5v3M0.5 8h3M12.5 8h3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Coordinates
        {point && <span className="coord-toggle-note">· {point.radiusKm} km</span>}
      </button>

      {open && (
        <form id={panelId} className="coord-panel" aria-label="Search by coordinates" noValidate onSubmit={onSubmit} onKeyDown={onKeyDown}>
          <div className="coord-fields">
            <div className="coord-field">
              <label className="control-label" htmlFor={latId}>
                Latitude
              </label>
              <input
                id={latId}
                className="coord-input"
                value={latText}
                onChange={(event) => setLatText(event.target.value)}
                onPaste={onPaste}
                placeholder="-9.45"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                aria-invalid={error ? true : undefined}
              />
            </div>
            <div className="coord-field">
              <label className="control-label" htmlFor={lonId}>
                Longitude
              </label>
              <input
                id={lonId}
                className="coord-input"
                value={lonText}
                onChange={(event) => setLonText(event.target.value)}
                onPaste={onPaste}
                placeholder="-40.2"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                aria-invalid={error ? true : undefined}
              />
            </div>
          </div>
          <p className="coord-help">Decimal degrees (WGS84); south and west are negative. Paste “lat, lon” to fill both.</p>

          <Button
            className="coord-pick"
            aria-pressed={picking}
            disabled={drawing}
            onClick={() => onPicking(!picking)}
          >
            {picking ? "Picking… click the map" : "Pick on map"}
          </Button>
          {picking && (
            <p className="coord-help" role="status">
              Click or tap the map to fill the fields. Escape cancels; other clicks still open cells afterwards.
            </p>
          )}

          <SegmentedControl label="Radius" options={RADIUS_OPTIONS} value={`${radius}`} onChange={onRadius} />

          <div className="coord-actions">
            <button ref={applyRef} type="submit" className="button coord-apply">
              Apply
            </button>
            <Button onClick={() => point && centerOn(point)} disabled={!point}>
              Center on point
            </Button>
            <Button onClick={clear} disabled={!point && !latText && !lonText && !error}>
              Clear
            </Button>
          </div>

          {error && (
            <p className="coord-error" role="alert">
              {error}
            </p>
          )}

          {point && (
            <div className="coord-result" aria-live="polite">
              <p className="coord-count">
                {!month ? (
                  "The count of native detections waits for the month on the map."
                ) : count.error && !count.loading ? (
                  <>Could not count the native detections: {count.error}</>
                ) : countText && !count.loading ? (
                  <>
                    <strong className="coord-count-value">{countText.value}</strong> {countText.label}
                  </>
                ) : (
                  `Counting native detections, ${month.label}…`
                )}
              </p>
              <p className="coord-meta">
                Area analyzed: the box around the {point.radiusKm} km circle
                {clamped ? ", cut to the study area" : ""}. The calendar and KPIs follow it.
                {filtered && " The count keeps only detections that pass the intensity and relevance filters."}
              </p>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
