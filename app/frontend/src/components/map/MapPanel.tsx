import { lazy, Suspense, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { cellsUrl, useRemote, weatherGridUrl, type CellsResponse, type WeatherGridResponse } from "../../data/api";
import { MONTHS_LONG } from "../../lib/format";
import { sequentialEdges } from "../../lib/scale";
import { LAYER_LABEL, type MapLayer } from "../../lib/weatherLayers";
import { useDashboard } from "../../state/dashboard";
import { Badge } from "../ui/Badge";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";
import { Legend } from "../viz/Legend";
import { WeatherLegend } from "../viz/WeatherLegend";
import { CellMap } from "./CellMap";
import { MapTools, type Projection } from "./MapTools";

const EMPTY: CellsResponse["cells"] = [];

const LAYER_OPTIONS: ReadonlyArray<SegmentOption<MapLayer>> = (
  ["hotspots", "temperature", "wind-speed", "wind-direction"] as const
).map((value) => ({ value, label: LAYER_LABEL[value] }));

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
  const [layer, setLayer] = useState<MapLayer>("hotspots");
  const remote = useRemote<CellsResponse>(cellsUrl(state.period, state.selected));

  const data = remote.data;
  const cells = data?.cells ?? EMPTY;
  // Fixed breaks from the API keep months comparable. The per-month fallback only serves an older backend
  // that sends no breaks; without data there are no breaks (and no legend) at all.
  const breaks = useMemo(
    () => (data ? (data.breaks ?? sequentialEdges(data.cells.map((cell) => cell.value)).edges) : []),
    [data],
  );
  // The weather layers are ERA5 context for the month on screen: asked only while one of them is open.
  const weatherLayer = layer !== "hotspots" && projection !== "3d" && data !== null ? layer : null;
  const weatherOn = weatherLayer !== null;
  const weather = useRemote<WeatherGridResponse>(
    weatherOn && data ? weatherGridUrl(state.area, { year: data.year, month: data.month }) : null,
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
          {layer === "hotspots" && estimated && <Badge kind="estimated" />}
          {layer === "hotspots" && partial && <Badge kind="partial" />}
        </div>
        {projection !== "3d" && (
          <SegmentedControl label="Map layer" options={LAYER_OPTIONS} value={layer} onChange={setLayer} />
        )}
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
          <CellMap
            mapRef={mapRef}
            cells={cells}
            breaks={breaks}
            area={state.area}
            projection={projection}
            layer={layer}
            weather={weatherOn ? weather.data : null}
          />
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

      {weatherLayer && (
        <WeatherLegend
          layer={weatherLayer}
          grid={weather.data}
          loading={weather.loading}
          error={weather.error}
          onRetry={weather.retry}
        />
      )}
      {data && !weatherLayer && (
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
