import { useEffect, useRef, useState, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { checkArea } from "../../lib/area";
import { cx } from "../../lib/cx";
import type { Bounds } from "../../lib/grid";
import { PILOT_BOUNDS } from "../../state/dashboard";
import { Button } from "../ui/Button";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";

/** All three are MapLibre: flat, globe, and "3d" (the globe tilted, with the cells raised by class). */
export type Projection = "mercator" | "globe" | "3d";

/** What each view is, in one line, so the choice is not a guess. Shown under the selector. */
export const VIEW_HELP: Record<Projection, string> = {
  mercator:
    "Flat: a standard flat map (Mercator), north up. Shapes are close to true near the equator, the Northeast included; areas stretch toward the poles.",
  globe:
    "Globe: the same map wrapped on a sphere. Good for the whole continent; the cells and layers stay where they are.",
  "3d": "3D: the globe tilted, with each hotspot cell raised and colored by its class (taller = a higher class, not a measured height). Drag with the right button to turn it. Weather layers are not in this view yet.",
};

const PROJECTIONS: ReadonlyArray<SegmentOption<Projection>> = [
  { value: "mercator", label: "Flat" },
  { value: "globe", label: "Globe" },
  { value: "3d", label: "3D" },
];

type MapToolsProps = {
  /** An extra sentence for the current layer (for example, the tilt of the municipal layer). */
  note?: string;
  mapRef: RefObject<MapRef | null>;
  projection: Projection;
  onProjection: (projection: Projection) => void;
  onArea: (area: Bounds) => void;
};

/**
 * Tools drawn over the map: flat / globe / 3D view, draw a rectangle (terra-draw, loaded only when asked) and use the
 * visible map area (easiest on a phone). Typed bounds live in the filter bar.
 */
export function MapTools({ mapRef, projection, onProjection, onArea, note }: MapToolsProps) {
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drawRef = useRef<{ stop(): void } | null>(null);

  useEffect(() => () => drawRef.current?.stop(), []);

  function apply(candidate: Bounds) {
    const check = checkArea(candidate, PILOT_BOUNDS);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setError(null);
    onArea(check.area);
  }

  function stopDrawing() {
    drawRef.current?.stop();
    drawRef.current = null;
    setDrawing(false);
  }

  async function startDrawing() {
    const map = mapRef.current?.getMap();
    if (!map) return;
    setError(null);
    const [{ TerraDraw, TerraDrawRectangleMode }, { TerraDrawMapLibreGLAdapter }] = await Promise.all([
      import("terra-draw"),
      import("terra-draw-maplibre-gl-adapter"),
    ]);
    stopDrawing();
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [new TerraDrawRectangleMode()],
    });
    draw.start();
    draw.setMode("rectangle");
    draw.on("finish", (id) => {
      const feature = draw.getSnapshotFeature(id);
      const ring = feature?.geometry.type === "Polygon" ? (feature.geometry.coordinates[0] as number[][]) : null;
      // Stop after the event has been handled, then forget this drawing instance.
      window.setTimeout(stopDrawing, 0);
      if (!ring) return;
      const lons = ring.map((point) => point[0]);
      const lats = ring.map((point) => point[1]);
      apply({ west: Math.min(...lons), south: Math.min(...lats), east: Math.max(...lons), north: Math.max(...lats) });
    });
    drawRef.current = draw;
    setDrawing(true);
  }

  function applyVisibleArea() {
    const bounds = mapRef.current?.getBounds();
    if (!bounds) return;
    apply({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() });
  }

  return (
    <>
      <div className="map-tools">
        <SegmentedControl label="Map view" options={PROJECTIONS} value={projection} onChange={onProjection} hideLabel />
        <p className="map-view-help">
          {VIEW_HELP[projection]}
          {note && <> {note}</>}
        </p>
        {drawing ? (
          <Button onClick={stopDrawing}>Cancel</Button>
        ) : (
          <Button onClick={() => void startDrawing()}>Draw area</Button>
        )}
        <Button onClick={applyVisibleArea}>Use visible area</Button>
      </div>
      {(drawing || error) && (
        <p className={cx("map-note", "map-hint", error && "map-error")} role={error ? "alert" : undefined}>
          {error ?? "Click or tap two opposite corners of the area."}
        </p>
      )}
    </>
  );
}
