import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import {
  cellsUrl,
  municipalitiesUrl,
  municipalitiesWeatherUrl,
  STATES_URL,
  useRemote,
  weatherGridUrl,
  type CellsResponse,
  type LiveWindResponse,
  type MunicipalitiesGeoJSON,
  type MunicipalitiesWeather,
  type StatesGeoJSON,
  type WeatherGridResponse,
} from "../../data/api";
import { MONTHS_LONG } from "../../lib/format";
import { regionWeather, stateAt, type RegionFeature } from "../../lib/regionWeather";
import { sequentialEdges } from "../../lib/scale";
import { LAYER_LABEL, type MapLayer } from "../../lib/weatherLayers";
import { useDashboard } from "../../state/dashboard";
import { Badge } from "../ui/Badge";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";
import { Legend } from "../viz/Legend";
import { LiveWindLegend } from "../viz/LiveWindLegend";
import { OverviewLegend } from "../viz/OverviewLegend";
import { MunicipalLegend } from "../viz/MunicipalLegend";
import { WeatherLegend } from "../viz/WeatherLegend";
import { CellMap } from "./CellMap";
import { MapTools, type Projection } from "./MapTools";
import { OverviewControls } from "./OverviewControls";
import { RegionWeatherPanel } from "./RegionWeatherPanel";

const EMPTY: CellsResponse["cells"] = [];

const LAYER_OPTIONS: ReadonlyArray<SegmentOption<MapLayer>> = (
  ["overview", "hotspots", "temperature", "wind-speed", "wind-direction", "municipalities"] as const
).map((value) => ({ value, label: LAYER_LABEL[value] }));

// The map opens flat, with the overview (temperature, hotspots and the live wind): those layers are MapLibre ones, and the
// 3D globe, which has no weather yet, stays one click away.
// The 3D view pulls in three.js: it only downloads when someone opens it.
const GlobeView = lazy(() => import("./GlobeView"));

/**
 * Map panel (task D3). Loaded on demand (React.lazy), so phones only download MapLibre when they open the map.
 * Shows the month selected in the calendar (the latest month until one is picked), harmonized scale.
 */
export default function MapPanel() {
  const [state, dispatch] = useDashboard();
  const mapRef = useRef<MapRef | null>(null);
  const [projection, setProjection] = useState<Projection>("mercator");
  const [layer, setLayer] = useState<MapLayer>("overview");
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
    layer !== "live-wind" &&
    layer !== "municipalities" &&
    layer !== "overview" &&
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
  // It starts with the map (the overview is the default view) and has no switch; the page only checks for a new
  // answer from time to time.
  const liveOn = layer === "overview" && projection !== "3d";
  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => {
    if (!liveOn) return;
    const timer = window.setInterval(() => setLiveTick((tick) => tick + 1), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [liveOn]);
  const live = useRemote<LiveWindResponse>(liveOn ? `/api/weather/live?r=${liveTick}` : null);
  // The municipalities of Ceará (IBGE) and their current feels-like temperature: asked only while that layer is open.
  const muniOn = layer === "municipalities" && projection !== "3d";
  const muniGeo = useRemote<MunicipalitiesGeoJSON>(muniOn ? municipalitiesUrl("ce") : null);
  const muniWeather = useRemote<MunicipalitiesWeather>(muniOn ? municipalitiesWeatherUrl("ce") : null);
  // The overview: what is shown, the region the user clicked and the answer for it.
  const [showThermal, setShowThermal] = useState(true);
  const [showHotspots, setShowHotspots] = useState(true);
  const [thermalOpacity, setThermalOpacity] = useState(0.5);
  const [clicked, setClicked] = useState<{ lng: number; lat: number } | null>(null);
  const states = useRemote<StatesGeoJSON>(liveOn ? STATES_URL : null);
  const stateFeatures = useMemo(() => (states.data?.features ?? []) as unknown as RegionFeature[], [states.data]);
  const clickedState = useMemo(
    () => (clicked ? stateAt(clicked.lng, clicked.lat, stateFeatures) : null),
    [clicked, stateFeatures],
  );
  const regionAnswer = useMemo(
    () =>
      clicked && live.data
        ? regionWeather(clicked.lng, clicked.lat, live.data.points, clickedState, live.data.step_deg)
        : null,
    [clicked, clickedState, live.data],
  );
  // The weather is from now; the hotspots are from the month picked in the calendar. Say so when they differ.
  const today = new Date();
  const sameMonth = !!data && data.year === today.getUTCFullYear() && data.month === today.getUTCMonth() + 1;
  const hotspotsMonth = data ? `${MONTHS_LONG[data.month - 1]} ${data.year}` : null;
  const estimated = cells.some((cell) => cell.estimated);
  const partial = cells.some((cell) => cell.partial);

  return (
    <div className="map-panel">
      <div className="map-head">
        <p className="map-month">
          {liveOn
            ? hotspotsMonth
              ? `Hotspots: ${hotspotsMonth}`
              : "Loading…"
            : muniOn
              ? "Ceará · now"
              : data
                ? `${MONTHS_LONG[data.month - 1]} ${data.year}`
                : "Loading…"}
          {remote.loading && data ? " · updating…" : ""}
        </p>
        <div className="map-badges">
          {(layer === "hotspots" || liveOn) && estimated && <Badge kind="estimated" />}
          {(layer === "hotspots" || liveOn) && partial && <Badge kind="partial" />}
          {liveOn && (
            <span className="badge" role={sameMonth ? undefined : "status"}>
              {sameMonth ? "Weather: now" : "Weather: now · a different period from the hotspots"}
            </span>
          )}
        </div>
        {projection !== "3d" && (
          <SegmentedControl label="Map layer" options={LAYER_OPTIONS} value={layer} onChange={setLayer} />
        )}
      </div>

      {liveOn && (
        <OverviewControls
          showThermal={showThermal}
          onShowThermal={setShowThermal}
          showHotspots={showHotspots}
          onShowHotspots={setShowHotspots}
          opacity={thermalOpacity}
          onOpacity={setThermalOpacity}
        />
      )}

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
            overview={
              liveOn
                ? {
                    showThermal,
                    thermalOpacity,
                    showHotspots,
                    selectedRegion: clickedState,
                    onRegionClick: (lng, lat) => setClicked({ lng, lat }),
                  }
                : null
            }
          />
        )}
        {liveOn && regionAnswer && live.data && (
          <RegionWeatherPanel answer={regionAnswer} live={live.data} onClose={() => setClicked(null)} />
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
      {liveOn && showThermal && <OverviewLegend live={live.data} hotspotsMonth={hotspotsMonth} sameMonth={sameMonth} />}
      {liveOn && <LiveWindLegend data={live.data} loading={live.loading} error={live.error} onRetry={live.retry} />}
      {data && !weatherLayer && !muniOn && (!liveOn || showHotspots) && (
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
