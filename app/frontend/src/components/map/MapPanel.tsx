import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import {
  cellsUrl,
  municipalitiesUrl,
  municipalitiesWeatherUrl,
  useRemote,
  weatherGridUrl,
  type CellsResponse,
  type LiveWindResponse,
  type MunicipalitiesGeoJSON,
  type MunicipalitiesWeather,
  type WeatherGridResponse,
} from "../../data/api";
import { SATELLITE_LABEL, pointsUrl, type PointsResponse } from "../../lib/detections";
import { MONTHS_LONG, formatCount } from "../../lib/format";
import { sequentialEdges } from "../../lib/scale";
import { LAYER_LABEL, type MapLayer } from "../../lib/weatherLayers";
import { useDashboard } from "../../state/dashboard";
import { Badge } from "../ui/Badge";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";
import { Legend } from "../viz/Legend";
import { LiveWindLegend } from "../viz/LiveWindLegend";
import { MunicipalLegend } from "../viz/MunicipalLegend";
import { WeatherLegend } from "../viz/WeatherLegend";
import { CellMap } from "./CellMap";
import { MapTools, type Projection } from "./MapTools";

const EMPTY: CellsResponse["cells"] = [];

const LAYER_OPTIONS: ReadonlyArray<SegmentOption<MapLayer>> = (
  ["hotspots", "detections", "temperature", "wind-speed", "wind-direction", "live-wind", "municipalities"] as const
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
  const weatherLayer =
    layer !== "hotspots" &&
    layer !== "detections" &&
    layer !== "live-wind" &&
    layer !== "municipalities" &&
    projection !== "3d" &&
    data !== null
      ? layer
      : null;
  const weatherOn = weatherLayer !== null;
  const weather = useRemote<WeatherGridResponse>(
    weatherOn && data ? weatherGridUrl(state.area, { year: data.year, month: data.month }) : null,
  );
  // The live wind is a fixed, wide region that is not tied to the month or the area. It refreshes by itself: the
  // server answers from a shared cache (a new request inside its 30 minutes costs nothing at the weather service).
  const liveOn = layer === "live-wind" && projection !== "3d";
  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => {
    if (!liveOn) return;
    const timer = window.setInterval(() => setLiveTick((tick) => tick + 1), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [liveOn]);
  const live = useRemote<LiveWindResponse>(liveOn ? `/api/weather/live?r=${liveTick}` : null);
  // The municipalities of Ceará (IBGE) and their current feels-like temperature: asked only while that layer is open.
  const muniOn = layer === "municipalities" && projection !== "3d";
  const muniGeo = useRemote<MunicipalitiesGeoJSON>(muniOn ? municipalitiesUrl("ce") : null);
  const muniWeather = useRemote<MunicipalitiesWeather>(muniOn ? municipalitiesWeatherUrl("ce") : null);
  // The native detections of the month on screen, in the selected area: asked only while that layer is open.
  const detectionsOn = layer === "detections" && projection !== "3d";
  const detections = useRemote<PointsResponse>(
    detectionsOn && data ? pointsUrl(state.area, { year: data.year, month: data.month }, state.period) : null,
  );
  const estimated = cells.some((cell) => cell.estimated);
  const partial = cells.some((cell) => cell.partial);

  return (
    <div className="map-panel">
      <div className="map-head">
        <p className="map-month">
          {liveOn ? "Now" : muniOn ? "Ceará · now" : data ? `${MONTHS_LONG[data.month - 1]} ${data.year}` : "Loading…"}
          {!liveOn && remote.loading && data ? " · updating…" : ""}
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
            live={liveOn ? live.data : null}
            municipal={muniOn && muniGeo.data ? { geo: muniGeo.data, weather: muniWeather.data } : null}
            detections={detectionsOn ? detections.data : null}
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
      {muniOn && <MunicipalLegend geo={muniGeo} weather={muniWeather} />}
      {liveOn && <LiveWindLegend data={live.data} loading={live.loading} error={live.error} onRetry={live.retry} />}
      {detectionsOn && (
        <p className="map-note" role="status">
          {detections.error
            ? `Could not load the detections: ${detections.error}`
            : detections.loading && !detections.data
              ? "Loading the detections…"
              : detections.data && detections.data.satellite
                ? `${formatCount(detections.data.rows)} native detections of ${SATELLITE_LABEL[detections.data.satellite]} in the area` +
                  (detections.data.sampled
                    ? ` (a fixed sample of ${formatCount(detections.data.points.length)} is drawn)`
                    : "") +
                  ". One dot per detection, at the pixel centre and the size of the pixel when zoomed in. Raw counts of one satellite, not harmonized: the harmonized view is the Hotspots layer."
                : "No native detection in this month and area. No detection does not mean no fire."}
        </p>
      )}
      {data && !weatherLayer && !liveOn && !muniOn && !detectionsOn && (
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
