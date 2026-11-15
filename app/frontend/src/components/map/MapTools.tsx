import { useEffect, useRef, useState, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { checkArea } from "../../lib/area";
import { cx } from "../../lib/cx";
import type { Bounds } from "../../lib/grid";
import { PILOT_BOUNDS } from "../../state/dashboard";
import { Button } from "../ui/Button";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";

export type Projection = "mercator" | "globe";

const PROJECTIONS: ReadonlyArray<SegmentOption<Projection>> = [
  { value: "mercator", label: "Flat" },
  { value: "globe", label: "Globe" },
];

type MapToolsProps = {
  mapRef: RefObject<MapRef | null>;
  projection: Projection;
  onProjection: (projection: Projection) => void;
  onArea: (area: Bounds) => void;
  /** In the L3 drill-down the area tools step aside for "Back to L2 cells" (Escape does the same). */
  drilled: boolean;
  onBack: () => void;
  /** Tells the map a rectangle is being drawn, so a click there draws instead of opening a drill-down. */
  onDrawing: (drawing: boolean) => void;
};

/**
 * Tools drawn over the map: flat/globe view, draw a rectangle (terra-draw, loaded only when asked) and use the
 * visible map area (easiest on a phone). Typed bounds live in the filter bar.
 */
export function MapTools({ mapRef, projection, onProjection, onArea, drilled, onBack, onDrawing }: MapToolsProps) {
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drawRef = useRef<{ stop(): void } | null>(null);

  useEffect(() => () => drawRef.current?.stop(), []);
  useEffect(() => onDrawing(drawing), [drawing, onDrawing]);

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
        {drilled && (
          <Button className="map-back" onClick={onBack} aria-keyshortcuts="Escape">
            ← Back to L2 cells
          </Button>
        )}
        <SegmentedControl label="Map view" options={PROJECTIONS} value={projection} onChange={onProjection} hideLabel />
        {!drilled &&
          (drawing ? (
            <Button onClick={stopDrawing}>Cancel</Button>
          ) : (
            <Button onClick={() => void startDrawing()}>Draw area</Button>
          ))}
        {!drilled && <Button onClick={applyVisibleArea}>Use visible area</Button>}
      </div>
      {(drawing || error) && (
        <p className={cx("map-note", "map-hint", error && "map-error")} role={error ? "alert" : undefined}>
          {error ?? "Click or tap two opposite corners of the area."}
        </p>
      )}
    </>
  );
}
