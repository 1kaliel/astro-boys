import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import {
  cellsUrl,
  municipalitiesUrl,
  municipalitiesWeatherUrl,
  STATES_URL,
  useRemote,
  weatherGridUrl,
  weatherMonthUrl,
  type CellsResponse,
  type MapSeries,
  type Satellite,
  type LiveWindResponse,
  type MunicipalitiesGeoJSON,
  type MonthFieldResponse,
  type MunicipalitiesWeather,
  type StatesGeoJSON,
  type WeatherGridResponse,
} from "../../data/api";
import { MONTHS_LONG } from "../../lib/format";
import { regionWeather, stateAt, type RegionFeature } from "../../lib/regionWeather";
import { fieldFor } from "../../lib/weatherField";
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

const SERIES_OPTIONS: ReadonlyArray<SegmentOption<MapSeries>> = [
  { value: "modis", label: "MODIS (raw)" },
  { value: "viirs", label: "VIIRS (raw)" },
  { value: "harmonized", label: "VIIRS-equivalent (harmonized)" },
];
const SERIES_UNIT: Record<MapSeries, string> = {
  harmonized: "VIIRS-equivalent hotspots per 0.25° cell and month, same classes for every month",
  modis: "MODIS native hotspot detections per 0.25° cell and month (one satellite, not harmonized)",
  viirs: "VIIRS native hotspot detections per 0.25° cell and month (one satellite, not harmonized)",
};
const SERIES_SHORT: Record<MapSeries, string> = {
  harmonized: "VIIRS-equivalent hotspots",
  modis: "MODIS native hotspot detections",
  viirs: "VIIRS native hotspot detections",
};
const SATELLITE_NAME: Record<Satellite, string> = {
  Aqua: "Aqua MODIS",
  Terra: "Terra MODIS",
  SNPP: "S-NPP VIIRS",
  N20: "NOAA-20 VIIRS",
};

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
  const [series, setSeries] = useState<MapSeries>("harmonized");
  const [satellite, setSatellite] = useState<Satellite | null>(null);
  const remote = useRemote<CellsResponse>(cellsUrl(state.period, state.selected, series, satellite));

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
  // The overview starts with the map (it is the default view) and has no switch for the wind. Its weather is of the
  // period of the hotspots on screen: for the current month the live field (the server answers from a shared cache, a
  // new request inside its 90 minutes costs nothing at the weather service; this page only checks from time to time),
  // for any other month the ERA5 of that month, on the same lattice. Never one in place of the other.
  const liveOn = layer === "overview" && projection !== "3d";
  const today = new Date();
  const current = { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
  const sameMonth = !!data && data.year === current.year && data.month === current.month;
  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => {
    if (!liveOn) return;
    const timer = window.setInterval(() => setLiveTick((tick) => tick + 1), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [liveOn]);
  const live = useRemote<LiveWindResponse>(liveOn && (!data || sameMonth) ? `/api/weather/live?r=${liveTick}` : null);
  const monthly = useRemote<MonthFieldResponse>(
    liveOn && data && !sameMonth ? weatherMonthUrl(data.year, data.month) : null,
  );
  const field = useMemo(
    () =>
      liveOn ? fieldFor(data ? { year: data.year, month: data.month } : null, current, live.data, monthly.data) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveOn, data, live.data, monthly.data, current.year, current.month],
  );
  const weatherSource = !data || sameMonth ? live : monthly;
  // The municipalities of Ceará (IBGE) and their current feels-like temperature: asked only while that layer is open.
  const muniOn = layer === "municipalities" && projection !== "3d";
  const muniGeo = useRemote<MunicipalitiesGeoJSON>(muniOn ? municipalitiesUrl("ce") : null);
  const muniWeather = useRemote<MunicipalitiesWeather>(muniOn ? municipalitiesWeatherUrl("ce") : null);
  // The overview: what is shown, the region the user clicked and the answer for it.
  const [showThermal, setShowThermal] = useState(true);
  const [showHotspots, setShowHotspots] = useState(true);
  const [thermalOpacity, setThermalOpacity] = useState(0.5);
  const [clicked, setClicked] = useState<{ lng: number; lat: number } | null>(null);
  const states = useRemote<StatesGeoJSON>(liveOn || muniOn ? STATES_URL : null);
  // The outline of the state the municipalities belong to (Ceará), taken from the same IBGE states answer.
  const muniOutline = useMemo(
    () =>
      (states.data?.features.find((f) => f.properties.uf === "CE") as
        GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | undefined) ?? null,
    [states.data],
  );
  const stateFeatures = useMemo(() => (states.data?.features ?? []) as unknown as RegionFeature[], [states.data]);
  const clickedState = useMemo(
    () => (clicked ? stateAt(clicked.lng, clicked.lat, stateFeatures) : null),
    [clicked, stateFeatures],
  );
  const regionAnswer = useMemo(
    () =>
      clicked && field ? regionWeather(clicked.lng, clicked.lat, field.points, clickedState, field.step_deg) : null,
    [clicked, clickedState, field],
  );
  // What the answer on screen is, taken from the answer itself: while a new choice loads, the old cells keep their own
  // name (and the panel says it is updating), they are never relabeled with the new choice.
  const shownSeries: MapSeries = data?.series ?? "harmonized";
  const unit = SERIES_UNIT[shownSeries];
  const sourceText =
    shownSeries === "harmonized"
      ? "NASA FIRMS, MODIS and VIIRS harmonized to VIIRS-equivalent counts"
      : `NASA FIRMS, native count of ${data?.satellite ? SATELLITE_NAME[data.satellite] : "one satellite"}, not harmonized`;
  const noCoverage = data?.coverage === "none";
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
            <span className="badge" role={field ? undefined : "status"}>
              {field
                ? field.kind === "live"
                  ? "Weather: now"
                  : `Weather: ERA5 monthly mean of ${hotspotsMonth}`
                : weatherSource.loading
                  ? "Weather: loading…"
                  : "Weather: not available for this month"}
            </span>
          )}
        </div>
        {projection !== "3d" && (
          <SegmentedControl label="Map layer" options={LAYER_OPTIONS} value={layer} onChange={setLayer} />
        )}
      </div>

      {(layer === "hotspots" || layer === "overview") && (
        <div className="map-series" role="group" aria-label="Hotspot series on the map">
          <SegmentedControl
            label="Hotspot series"
            options={SERIES_OPTIONS}
            value={series}
            onChange={(next) => {
              setSeries(next);
              setSatellite(null);
            }}
          />
          {series !== "harmonized" && (data?.available_satellites?.length ?? 0) > 1 && (
            <SegmentedControl
              label="Satellite"
              options={(data?.available_satellites ?? []).map((s) => ({ value: s, label: SATELLITE_NAME[s] }))}
              value={(satellite ?? data?.satellite ?? data?.available_satellites?.[0]) as Satellite}
              onChange={setSatellite}
            />
          )}
          <p className="map-series-note" role="status">
            {remote.loading && data ? "Updating the map… " : ""}
            {shownSeries === "harmonized"
              ? estimated
                ? "Harmonized: months before February 2012 are estimated from MODIS (cells marked as estimated carry a 90% interval)."
                : "Harmonized: observed by VIIRS in this month."
              : `Native counts of ${data?.satellite ? SATELLITE_NAME[data.satellite] : "one satellite"}: they do not add up with the other satellites and are not comparable across MODIS and VIIRS.`}
            {shownSeries !== "harmonized" && data?.coverage_checked === false && !noCoverage
              ? " The days this satellite observed could not be checked, so its cells are marked partial: a low count may be missing days, not low activity."
              : ""}
          </p>
        </div>
      )}

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
            cellUnit={SERIES_SHORT[shownSeries]}
            cellSource={sourceText}
            cellDate={hotspotsMonth}
            area={state.area}
            projection={projection}
            layer={layer}
            weather={weatherOn ? weather.data : null}
            live={liveOn ? field : null}
            municipal={
              muniOn && muniGeo.data ? { geo: muniGeo.data, weather: muniWeather.data, outline: muniOutline } : null
            }
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
        {liveOn && regionAnswer && field && (
          <RegionWeatherPanel answer={regionAnswer} field={field} onClose={() => setClicked(null)} />
        )}
        <MapTools
          mapRef={mapRef}
          projection={projection}
          onProjection={setProjection}
          note={
            muniOn
              ? "This layer is tilted 50° so the municipalities read in relief: drag with the right button (or two fingers) to turn it. Another layer brings it back to north up."
              : undefined
          }
          onArea={(area) => dispatch({ type: "setArea", area })}
        />
      </div>

      {remote.error && (
        <p className="map-note map-error" role="alert">
          Could not load the cells: {remote.error}
        </p>
      )}
      {noCoverage && (
        <p className="map-note" role="status">
          {data?.reason ?? "This series has no data in this month."} This is a gap in coverage, not zero detections:
          pick another series or month.
        </p>
      )}
      {data && data.cells.length === 0 && !noCoverage && (
        <p className="map-note">
          No cell has a record for this series in this month. A cell without a record is not a zero, and no detection
          does not mean no fire.
        </p>
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
      {liveOn && showThermal && (
        <OverviewLegend
          field={field}
          hotspotsMonth={hotspotsMonth}
          current={!data || sameMonth}
          loading={weatherSource.loading}
          error={weatherSource.error}
          onRetry={weatherSource.retry}
        />
      )}
      {liveOn && (
        <LiveWindLegend
          field={field}
          periodName={!data || sameMonth ? "the current weather" : (hotspotsMonth ?? "this month")}
          loading={weatherSource.loading}
          error={weatherSource.error}
          onRetry={weatherSource.retry}
        />
      )}
      {data && !weatherLayer && !muniOn && (!liveOn || showHotspots) && (
        <Legend
          mode="sequential"
          breaks={breaks}
          unit={`${unit} · cells with no record are not drawn`}
          showMarking={false}
        />
      )}
    </div>
  );
}
