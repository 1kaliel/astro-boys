import { lazy, Suspense, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { cellsUrl, useRemote, type CellsResponse } from "../../data/api";
import { MONTHS_LONG } from "../../lib/format";
import { sequentialEdges } from "../../lib/scale";
import { useDashboard } from "../../state/dashboard";
import { Badge } from "../ui/Badge";
import { Legend } from "../viz/Legend";
import { CellMap } from "./CellMap";
import { MapTools, type Projection } from "./MapTools";

const EMPTY: CellsResponse["cells"] = [];

/** The 3D view and MapLibre both need WebGL; without it the flat map is the only choice that can still try. */
function supportsWebGL(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

// The 3D view pulls in three.js: it only downloads when someone opens it.
const GlobeView = lazy(() => import("./GlobeView"));

/**
 * Map panel (task D3). Loaded on demand (React.lazy), so phones only download MapLibre when they open the map.
 * Shows the month selected in the calendar (the latest month until one is picked), harmonized scale.
 */
export default function MapPanel() {
  const [state, dispatch] = useDashboard();
  const mapRef = useRef<MapRef | null>(null);
  const [projection, setProjection] = useState<Projection>(() => (supportsWebGL() ? "3d" : "mercator"));
  const remote = useRemote<CellsResponse>(cellsUrl(state.period, state.selected));

  const data = remote.data;
  const cells = data?.cells ?? EMPTY;
  // Fixed breaks from the API keep months comparable. The per-month fallback only serves an older backend
  // that sends no breaks; without data there are no breaks (and no legend) at all.
  const breaks = useMemo(
    () => (data ? (data.breaks ?? sequentialEdges(data.cells.map((cell) => cell.value)).edges) : []),
    [data],
  );
  const estimated = cells.some((cell) => cell.estimated);
  const partial = cells.some((cell) => cell.partial);

  return (
    <div className="map-panel">
      <div className="map-head">
        <p className="map-month">
          {data ? `${MONTHS_LONG[data.month - 1]} ${data.year}` : "Loading…"}
          {remote.loading && data ? " · updating…" : ""}
        </p>
        <div className="map-badges">
          {estimated && <Badge kind="estimated" />}
          {partial && <Badge kind="partial" />}
        </div>
      </div>

      <div className="map-stage">
        {projection === "3d" ? (
          <Suspense fallback={<p className="map-note">Loading the 3D globe…</p>}>
            <GlobeView
              cells={cells}
              breaks={breaks}
              area={state.area}
              onArea={(area) => dispatch({ type: "setArea", area })}
            />
          </Suspense>
        ) : (
          <CellMap mapRef={mapRef} cells={cells} breaks={breaks} area={state.area} projection={projection} />
        )}
        <MapTools
          mapRef={mapRef}
          projection={projection}
          onProjection={setProjection}
          onArea={(area) => dispatch({ type: "setArea", area })}
        />
      </div>

      {remote.error && (
        <p className="map-note map-error" role="alert">
          Could not load the cells: {remote.error}
        </p>
      )}
      {data && data.cells.length === 0 && (
        <p className="map-note">No hotspot detections in this month. No detection does not mean no fire.</p>
      )}

      {data && (
        <Legend
          mode="sequential"
          breaks={breaks}
          unit="VIIRS-equivalent hotspots per 0.25° cell and month, same classes for every month · cells with no detection are not drawn"
          showMarking={false}
        />
      )}
    </div>
  );
}
