import "maplibre-gl/dist/maplibre-gl.css";
import { setWorkerUrl, type ExpressionSpecification, type StyleSpecification } from "maplibre-gl";
// MapLibre looks for its worker next to its own file, which does not exist after bundling: point it at the asset.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useMemo, useState, type RefObject } from "react";
import Map, {
  Layer,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { MunicipalitiesGeoJSON, MunicipalitiesWeather, WeatherGridResponse } from "../../data/api";
import { formatCount } from "../../lib/format";
import {
  boundsToGeoJSON,
  cellOutlinesGeoJSON,
  cellsInBounds,
  cellsToGeoJSON,
  type Bounds,
  type CellFeatureProps,
} from "../../lib/grid";
import { LABELS_STYLE_URL, ON_IMAGERY, ON_IMAGERY_HALO, satelliteStyle } from "../../lib/basemap";
import { contains, loadBrazil, type Outline } from "../../lib/brazil";
import { prefersReducedMotion, readTokens, useColorScheme } from "../../lib/hooks";
import { FEELS_LIKE_BREAKS, centroidPoints, joinWeather } from "../../lib/municipalities";
import { rampStep } from "../../lib/scale";
import { LAYER_LABEL, breaksOf, unitOf, weatherGeoJSON, type MapLayer } from "../../lib/weatherLayers";
import { renderThermalSurface } from "../../lib/thermalSurface";
import type { RegionFeature } from "../../lib/regionWeather";
import type { WeatherField } from "../../lib/weatherField";
import { WindField } from "../../lib/windField";
import { CompassRing } from "./CompassRing";
import { WindParticles } from "./WindParticles";
import { PILOT_BOUNDS } from "../../state/dashboard";

setWorkerUrl(workerUrl);

const STYLE_TIMEOUT_MS = 5000;

const SEQ_TOKENS = [1, 2, 3, 4, 5, 6, 7].map((i) => `--viz-seq-${i}`);
const WX_TOKENS = [1, 2, 3, 4, 5, 6, 7].map((i) => `--wx-seq-${i}`);
const THERMAL_TOKENS = [1, 2, 3, 4, 5, 6, 7].map((i) => `--viz-thermal-${i}`);
const TOKENS = [
  ...SEQ_TOKENS,
  ...WX_TOKENS,
  ...THERMAL_TOKENS,
  "--viz-wind",
  "--color-accent",
  "--viz-selection",
  "--color-surface",
  "--color-text-primary",
  "--color-border-strong",
] as const;

type ArrowMap = { hasImage(id: string): boolean; addImage(id: string, image: object, options?: object): void };

/** Adds the tintable arrow icon of the static wind view if the map does not have it yet. */
function ensureWindArrow(map: ArrowMap): void {
  try {
    if (map.hasImage("wind-arrow")) return;
    const image = windArrow();
    if (image) map.addImage("wind-arrow", image, { sdf: true });
  } catch {
    // The style is not ready yet: the next style event tries again.
  }
}

/** A white arrow on a transparent 48 px canvas; the map tints it (sdf), so it follows the theme. */
function windArrow(): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} | null {
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(size / 2, 4); // tip, pointing up (north); the layer rotates it
  ctx.lineTo(size - 12, size - 8);
  ctx.lineTo(size / 2, size - 18);
  ctx.lineTo(12, size - 8);
  ctx.closePath();
  ctx.fill();
  const image = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: image.data };
}

/** Pan limits in the flat view, [west, south, east, north]: the pilot extent with a margin. */
const MERCATOR_LIMITS: [number, number, number, number] = [-80, -40, -20, 14];
/** The region of the live wind lattice (wider than Brazil), framed until the outline of Brazil is loaded. */
/** How far the map is tilted while the municipalities are shown (degrees; MapLibre allows up to 60). */
const MUNI_PITCH = 50;
/** Tilt of the 3D view, and the height of one class of cells in meters (the heights are classes, not measurements). */
const RELIEF_PITCH = 55;
const RELIEF_STEP_M = 9000;
const LIVE_REGION: Bounds = { west: -75, south: -35, east: -25, north: 8 };

/** Loads the names and borders for the satellite basemap; without them (service down) the imagery shows alone. */
function useBasemap(): {
  style: StyleSpecification | null;
  offline: boolean;
} {
  const [state, setState] = useState<{
    style: StyleSpecification | null;
    offline: boolean;
  }>({ style: null, offline: false });
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), STYLE_TIMEOUT_MS);
    fetch(LABELS_STYLE_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Basemap style failed (${response.status})`);
        return response.json() as Promise<StyleSpecification>;
      })
      .then((labels) => !cancelled && setState({ style: satelliteStyle(labels), offline: false }))
      .catch(() => {
        if (cancelled) return;
        setState({ style: satelliteStyle(null), offline: true });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);
  return state;
}

/** The outline of Brazil, loaded the first time `wanted` is true (null until then, or if it fails to load). */
function useBrazil(wanted: boolean): Outline | null {
  const [outline, setOutline] = useState<Outline | null>(null);
  useEffect(() => {
    if (!wanted || outline) return;
    let cancelled = false;
    loadBrazil()
      .then((o) => !cancelled && setOutline(o))
      .catch(() => undefined); // bundled with the app: only a broken build gets here; the wind then stays hidden
    return () => {
      cancelled = true;
    };
  }, [wanted, outline]);
  return outline;
}

type CellMapProps = {
  mapRef: RefObject<MapRef | null>;
  cells: readonly CellFeatureProps[];
  /** Fixed, strictly increasing class limits from the API (the same for every month). */
  breaks: readonly number[];
  /** What a value is and where it comes from, for the cell popup (from the answer on screen). */
  cellUnit?: string;
  cellSource?: string;
  cellDate?: string | null;
  area: Bounds;
  /** "3d" is the globe projection tilted, with the cells extruded by class. */
  projection: "mercator" | "globe" | "3d";
  /** What is drawn: the hotspot cells (default) or one ERA5 weather layer. Never both at once. */
  layer?: MapLayer;
  /** ERA5 monthly means at sampled points, for the weather layers. */
  weather?: WeatherGridResponse | null;
  /**
   * The weather field of the overview: the weather now, or the ERA5 month of the month picked in the calendar. The wind
   * is animated streaks (static arrows when the user prefers reduced motion) and the temperature a surface.
   */
  live?: WeatherField | null;
  /** A state's municipalities (IBGE) colored by the current feels-like temperature: a tilted view with a compass. */
  municipal?: {
    geo: MunicipalitiesGeoJSON;
    weather: MunicipalitiesWeather | null;
    /** The outline of the state itself (IBGE), drawn in bold so the municipalities read as a whole. */
    outline?: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null;
  } | null;
  /**
   * The default view: the live temperature surface, the hotspot cells and the live wind together. The wind has no
   * switch (it is always on while the map is visible); the surface and the cells can be hidden, and the surface has an
   * adjustable opacity.
   */
  overview?: {
    showThermal: boolean;
    thermalOpacity: number;
    showHotspots: boolean;
    selectedRegion: RegionFeature | null;
    onRegionClick: (lng: number, lat: number) => void;
  } | null;
};

type Hover = { lng: number; lat: number; cell: CellFeatureProps };

export function CellMap({
  mapRef,
  cells,
  breaks,
  cellUnit,
  cellSource,
  cellDate,
  area,
  projection,
  layer = "hotspots",
  weather = null,
  live = null,
  municipal = null,
  overview = null,
}: CellMapProps) {
  const relief = projection === "3d";
  const scheme = useColorScheme();
  const { style, offline } = useBasemap();
  // Re-read the tokens whenever the theme changes.
  const colors = useMemo(() => readTokens(TOKENS), [scheme]);
  const [hover, setHover] = useState<Hover | null>(null);
  const [wxHover, setWxHover] = useState<{
    lng: number;
    lat: number;
    props: Record<string, unknown>;
  } | null>(null);
  const muniOn = layer === "municipalities";
  const overviewOn = layer === "overview";
  const hideCells = layer !== "hotspots" && !(overviewOn && overview?.showHotspots !== false);
  // The streaks need the map instance, which exists only after the map has loaded: waiting here is what lets the wind
  // start by itself when the overview is the first thing on screen.
  const [mapReady, setMapReady] = useState(false);
  const showWeather = layer !== "hotspots" && !muniOn && !overviewOn;
  const liveOn = overviewOn;
  // Every wind layer is clipped to Brazil: the live lattice is a rectangle much wider than the country, and the ERA5
  // points of the selected area include ocean and neighbors. The temperature surface is not clipped.
  const windOn = liveOn || layer === "wind-speed" || layer === "wind-direction";
  const brazil = useBrazil(windOn);
  const brazilData = useMemo(() => brazil?.geojson ?? null, [brazil]);
  const [muniHover, setMuniHover] = useState<{ lng: number; lat: number; props: Record<string, unknown> } | null>(null);
  // Matches no municipality when nothing is under the pointer (an empty code never occurs in the data).
  const muniHoverCode = muniHover ? String(muniHover.props.code ?? "") : "";
  const muniShapes = useMemo(() => (municipal ? joinWeather(municipal.geo, municipal.weather) : null), [municipal]);
  const muniPoints = useMemo(
    () => (municipal && muniShapes ? centroidPoints(municipal.geo, muniShapes) : null),
    [municipal, muniShapes],
  );
  // The teal ramp of the weather layers, one color per class of feels-like; no value gets the neutral "no data" color.
  const muniFill = useMemo((): ExpressionSpecification => {
    const color = (cls: number) =>
      colors[`--viz-thermal-${rampStep(cls, FEELS_LIKE_BREAKS.length + 1)}` as (typeof TOKENS)[number]];
    return [
      "case",
      ["has", "feels"],
      ["step", ["get", "feels"], color(1), ...FEELS_LIKE_BREAKS.flatMap((edge, i) => [edge, color(i + 2)])],
      colors["--color-border-strong"],
    ] as unknown as ExpressionSpecification;
  }, [colors]);
  const reduceMotion = useMemo(() => prefersReducedMotion(), []);
  // Live wind is streaks that move; with reduced motion it is the same data as static arrows.
  const liveStreaks = liveOn && !reduceMotion;
  const arrows = layer === "wind-direction" || (liveOn && reduceMotion);
  const wxSource = (showWeather || arrows) && !liveStreaks;
  // The wind moves at the flow of the field: the wind speed now, or the length of the month's mean wind vector.
  const flowPoints = useMemo(() => live?.points.map((p) => ({ ...p, wind_speed_kmh: p.flow_kmh })) ?? null, [live]);
  const wxData = useMemo(() => {
    const points = (liveOn ? flowPoints : weather?.points) ?? [];
    // Wind points outside Brazil are dropped (and no wind is shown until the outline is there).
    const shown = windOn ? (brazil ? points.filter((p) => contains(brazil, p.lon, p.lat)) : []) : points;
    return weatherGeoJSON(shown, liveOn ? "live-wind" : layer);
  }, [weather, flowPoints, layer, liveOn, windOn, brazil]);
  const windField = useMemo(
    () =>
      flowPoints && brazil
        ? new WindField(flowPoints, { bounds: brazil.bounds, contains: (lon, lat) => contains(brazil, lon, lat) })
        : null,
    [flowPoints, brazil],
  );
  // The temperature surface: drawn once per answer (not per frame, not per move), coldest class first.
  const thermalColors = useMemo(() => THERMAL_TOKENS.map((name) => colors[name as (typeof TOKENS)[number]]), [colors]);
  const surface = useMemo(
    () =>
      overviewOn && overview?.showThermal && live
        ? renderThermalSurface(
            live.points.map((p) => ({ lat: p.lat, lon: p.lon, value: p.temperature_c })),
            thermalColors,
          )
        : null,
    [overviewOn, overview?.showThermal, live, thermalColors],
  );
  // Surface and hotspot cells go under the borders and names of the basemap, so those stay readable on top.
  const bordersBefore = useMemo(() => style?.layers.find((l) => l.id.startsWith("boundary_"))?.id, [style]);
  const selectedGeoJSON = useMemo(
    () =>
      overview?.selectedRegion
        ? { type: "Feature" as const, properties: {}, geometry: overview.selectedRegion.geometry }
        : null,
    [overview?.selectedRegion],
  );
  const wxFill = useMemo((): ExpressionSpecification | string => {
    const limits = breaksOf(layer);
    const ramp = layer === "temperature" ? "viz-thermal" : "wx-seq";
    const color = (cls: number) => colors[`--${ramp}-${rampStep(cls, limits.length + 1)}` as (typeof TOKENS)[number]];
    if (limits.length === 0) return color(1);
    return [
      "step",
      ["get", "value"],
      color(1),
      ...limits.flatMap((edge, i) => [edge, color(i + 2)]),
    ] as unknown as ExpressionSpecification;
  }, [colors, layer]);

  // Zero detections are not drawn: "no detection" (never "no fire"), and empty areas stay empty.
  const cellData = useMemo(() => cellsToGeoJSON(cells.filter((cell) => cell.value > 0)), [cells]);
  const areaData = useMemo(() => boundsToGeoJSON(area), [area]);
  // The L2 cells of the area, one outline each: what the calendar and KPIs sum, drawn on the map.
  const areaCellData = useMemo(() => cellOutlinesGeoJSON(cellsInBounds(area)), [area]);

  const fillColor = useMemo((): ExpressionSpecification | string => {
    const classes = breaks.length + 1;
    const color = (cls: number) => colors[`--viz-seq-${rampStep(cls, classes)}` as (typeof TOKENS)[number]];
    if (breaks.length === 0) return color(1);
    return [
      "step",
      ["get", "value"],
      color(1),
      ...breaks.flatMap((edge, i) => [edge, color(i + 2)]),
    ] as unknown as ExpressionSpecification;
  }, [colors, breaks]);

  // Height of a cell in the 3D view: its class (the same classes as the colors) times a fixed step.
  const reliefHeight = useMemo((): ExpressionSpecification => {
    if (breaks.length === 0) return RELIEF_STEP_M as unknown as ExpressionSpecification;
    return [
      "step",
      ["get", "value"],
      RELIEF_STEP_M,
      ...breaks.flatMap((edge, i) => [edge, RELIEF_STEP_M * (i + 2)]),
    ] as unknown as ExpressionSpecification;
  }, [breaks]);

  // Follow the selected area, or show the whole wide region while the live wind is on (no animation when the user
  // asked for reduced motion).
  // The overview opens on the selected area (the Northeast by default): the wind covers Brazil, the view stays on the study area.
  const target = muniOn && municipal ? municipal.geo.bounds : area;
  useEffect(() => {
    mapRef.current?.fitBounds(
      [
        [target.west, target.south],
        [target.east, target.north],
      ],
      // The municipalities are seen from an angle (a tilted map); every other layer is flat and north up.
      {
        padding: 24,
        duration: prefersReducedMotion() ? 0 : 400,
        pitch: muniOn ? MUNI_PITCH : relief ? RELIEF_PITCH : 0,
        bearing: 0,
      },
    );
  }, [target.west, target.south, target.east, target.north, muniOn, relief, mapRef]);

  const onPointer = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) {
      setHover(null);
      return;
    }
    const p = feature.properties as Record<string, unknown>;
    setHover({
      lng: event.lngLat.lng,
      lat: event.lngLat.lat,
      cell: {
        id: String(p.id),
        value: Number(p.value),
        estimated: p.estimated === true || p.estimated === "true",
        partial: p.partial === true || p.partial === "true",
        ci_low: p.ci_low == null ? undefined : Number(p.ci_low),
        ci_high: p.ci_high == null ? undefined : Number(p.ci_high),
        satellite: typeof p.satellite === "string" ? p.satellite : undefined,
      },
    });
  };

  const onMuniPointer = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    setMuniHover(
      feature
        ? { lng: event.lngLat.lng, lat: event.lngLat.lat, props: feature.properties as Record<string, unknown> }
        : null,
    );
  };

  const onWeatherPointer = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    setWxHover(
      feature
        ? {
            lng: event.lngLat.lng,
            lat: event.lngLat.lat,
            props: feature.properties as Record<string, unknown>,
          }
        : null,
    );
  };

  if (!style) {
    return <div className="map-canvas map-loading">Loading basemap…</div>;
  }

  return (
    <div className="map-canvas">
      <Map
        ref={mapRef}
        mapStyle={style}
        initialViewState={{
          bounds: [
            [PILOT_BOUNDS.west, PILOT_BOUNDS.south],
            [PILOT_BOUNDS.east, PILOT_BOUNDS.north],
          ],
          fitBoundsOptions: { padding: 16 },
        }}
        projection={projection === "mercator" ? "mercator" : "globe"}
        maxBounds={projection === "mercator" ? MERCATOR_LIMITS : undefined}
        minZoom={projection === "mercator" ? 3 : 1}
        maxZoom={10}
        dragRotate={muniOn || relief}
        pitchWithRotate={muniOn || relief}
        touchPitch={muniOn || relief}
        pixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
        fadeDuration={0}
        attributionControl={{ compact: true }}
        interactiveLayerIds={
          muniOn
            ? ["muni-fill"]
            : overviewOn
              ? ["cells-fill"]
              : showWeather
                ? [arrows ? "wx-arrow" : "wx-circle"]
                : ["cells-fill"]
        }
        onMouseMove={muniOn ? onMuniPointer : showWeather ? onWeatherPointer : onPointer}
        onClick={(event) => {
          if (muniOn) onMuniPointer(event);
          else if (showWeather) onWeatherPointer(event);
          else onPointer(event);
          if (overviewOn) overview?.onRegionClick(event.lngLat.lng, event.lngLat.lat);
        }}
        onMouseLeave={() => {
          setMuniHover(null);
          setHover(null);
          setWxHover(null);
        }}
        onLoad={(event) => {
          event.target.touchZoomRotate.disableRotation();
          event.target.keyboard.disableRotation();
          ensureWindArrow(event.target);
          setMapReady(true);
        }}
        // The arrow image is put on the map whenever a style has loaded (and again after a basemap change, which wipes
        // it): with the overview as the default view the arrow layer already exists when the style arrives, before
        // `load`, so asking for the image later would be too late.
        onStyleData={(event) => ensureWindArrow(event.target)}
        cursor={hover || wxHover || muniHover ? "pointer" : "grab"}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <Source id="cells" type="geojson" data={cellData}>
          {/* No stroke around cells: an estimated month is flagged once (badge), not on thousands of cells. */}
          {relief ? (
            // Same cells, raised by class. The id stays "cells-fill" for the pointer and the layers placed under it.
            <Layer
              id="cells-fill"
              key="cells-extrusion"
              type="fill-extrusion"
              paint={{
                "fill-extrusion-color": fillColor,
                "fill-extrusion-height": reliefHeight,
                "fill-extrusion-opacity": 0.92,
                "fill-extrusion-vertical-gradient": true,
              }}
            />
          ) : (
            <Layer
              id="cells-fill"
              key="cells-flat"
              type="fill"
              beforeId={bordersBefore}
              layout={{ visibility: hideCells ? "none" : "visible" }}
              paint={{ "fill-color": fillColor, "fill-opacity": 0.85 }}
            />
          )}
          {/* A fine light outline, so the hotspot cells stay readable over the temperature colors. */}
          <Layer
            id="cells-outline"
            type="line"
            beforeId={bordersBefore}
            layout={{ visibility: hideCells || relief ? "none" : "visible" }}
            paint={{ "line-color": colors["--color-text-primary"], "line-width": 0.6, "line-opacity": 0.6 }}
          />
        </Source>
        {/* Always directly under the hotspot cells, even when the image is replaced (a new month adds it again). */}
        {surface && overview && (
          <Source id="thermal" type="image" url={surface.url} coordinates={surface.coordinates}>
            <Layer
              id="thermal-surface"
              type="raster"
              beforeId="cells-fill"
              paint={{ "raster-opacity": overview.thermalOpacity, "raster-fade-duration": 0 }}
            />
          </Source>
        )}
        {wxSource && (
          <Source id="weather" type="geojson" data={wxData}>
            {arrows ? (
              <Layer
                key="wx-arrow"
                id="wx-arrow"
                type="symbol"
                layout={{
                  "icon-image": "wind-arrow",
                  "icon-rotate": ["get", "toward"],
                  "icon-rotation-alignment": "map",
                  "icon-allow-overlap": true,
                  "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.35, 6, 0.6, 9, 0.9],
                }}
                paint={{
                  "icon-color": ON_IMAGERY,
                  "icon-halo-color": ON_IMAGERY_HALO,
                  "icon-halo-width": 1,
                }}
              />
            ) : (
              <Layer
                key="wx-circle"
                id="wx-circle"
                type="circle"
                paint={{
                  "circle-color": wxFill,
                  "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 5, 6, 12, 9, 22],
                  "circle-stroke-color": colors["--color-surface"],
                  "circle-stroke-width": 0.5,
                  "circle-opacity": 0.9,
                }}
              />
            )}
          </Source>
        )}
        {overviewOn && selectedGeoJSON && (
          <Source id="selected-region" type="geojson" data={selectedGeoJSON}>
            <Layer
              id="selected-region-line"
              type="line"
              paint={{ "line-color": colors["--color-accent"], "line-width": 2.5 }}
            />
          </Source>
        )}
        {muniOn && muniShapes && muniPoints && (
          <>
            <Source id="municipalities" type="geojson" data={muniShapes}>
              <Layer id="muni-fill" type="fill" paint={{ "fill-color": muniFill, "fill-opacity": 0.7 }} />
              {/* The municipality under the pointer: a brighter fill and a clear outline, only for that one. */}
              <Layer
                id="muni-hover-fill"
                type="fill"
                filter={["==", ["get", "code"], muniHoverCode]}
                paint={{ "fill-color": colors["--color-text-primary"], "fill-opacity": 0.28 }}
              />
              <Layer
                id="muni-hover-line"
                type="line"
                filter={["==", ["get", "code"], muniHoverCode]}
                paint={{ "line-color": colors["--color-text-primary"], "line-width": 2.5, "line-opacity": 1 }}
              />
              <Layer
                id="muni-line"
                type="line"
                paint={{ "line-color": colors["--color-text-primary"], "line-width": 0.6, "line-opacity": 0.45 }}
              />
            </Source>
            {municipal?.outline && (
              <Source id="state-outline" type="geojson" data={municipal.outline}>
                <Layer
                  id="state-outline-line"
                  type="line"
                  paint={{ "line-color": colors["--color-text-primary"], "line-width": 2, "line-opacity": 0.9 }}
                />
              </Source>
            )}
            <Source id="municipality-centres" type="geojson" data={muniPoints}>
              <Layer
                id="muni-centre"
                type="circle"
                paint={{
                  "circle-color": muniFill,
                  "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 1.5, 7, 3, 9, 5.5],
                  "circle-stroke-color": colors["--color-text-primary"],
                  "circle-stroke-width": 1,
                  "circle-opacity": 0.95,
                }}
              />
            </Source>
          </>
        )}
        {windOn && brazilData && (
          <Source id="brazil" type="geojson" data={brazilData}>
            <Layer
              id="brazil-line"
              type="line"
              paint={{ "line-color": ON_IMAGERY, "line-width": 1.5, "line-opacity": 0.9 }}
            />
          </Source>
        )}
        <Source id="area-cells" type="geojson" data={areaCellData}>
          <Layer
            id="area-cells-line"
            type="line"
            // The 0.25° outlines belong to the hotspot cells: with a weather layer on, they only add noise.
            layout={{ visibility: hideCells ? "none" : "visible" }}
            paint={{
              "line-color": colors["--viz-selection"],
              "line-width": 0.5,
              "line-opacity": 0.6,
            }}
          />
        </Source>
        <Source id="area" type="geojson" data={areaData}>
          <Layer
            id="area-line"
            type="line"
            // The pilot box has nothing to say about one state's municipalities: it would only cut across the view.
            layout={{ visibility: muniOn ? "none" : "visible" }}
            paint={{ "line-color": colors["--viz-selection"], "line-width": 2 }}
          />
        </Source>
        {muniOn && muniHover && (
          <Popup
            longitude={muniHover.lng}
            latitude={muniHover.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            offset={10}
            className="map-popup"
          >
            <strong>{String(muniHover.props.name)}</strong>
            <br />
            {muniHover.props.feels === undefined || muniHover.props.feels === null
              ? "No value from the model"
              : `Feels like ${Number(muniHover.props.feels).toFixed(1)} °C`}
            {muniHover.props.temperature !== undefined &&
              muniHover.props.temperature !== null &&
              ` · air ${Number(muniHover.props.temperature).toFixed(1)} °C`}
            {muniHover.props.humidity !== undefined &&
              muniHover.props.humidity !== null &&
              ` · humidity ${Math.round(Number(muniHover.props.humidity))}%`}
            <br />
            Model value at the municipality centre
          </Popup>
        )}
        {showWeather && wxHover && (
          <Popup
            longitude={wxHover.lng}
            latitude={wxHover.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            offset={10}
            className="map-popup"
          >
            <strong>{LAYER_LABEL[layer]}</strong>
            {liveOn
              ? " · model point, now"
              : ` · ERA5 grid point, ${weather?.year}-${String(weather?.month ?? 0).padStart(2, "0")}`}
            <br />
            {layer === "temperature" && `${Number(wxHover.props.temperature).toFixed(1)} ${unitOf(layer)}`}
            {layer === "wind-speed" && `${Number(wxHover.props.speed).toFixed(1)} ${unitOf(layer)}`}
            {(layer === "wind-direction" || liveOn) &&
              `Wind blows toward ${Math.round(Number(wxHover.props.toward))}° (from ${Math.round(Number(wxHover.props.from))}°), ${Number(wxHover.props.speed).toFixed(1)} km/h`}
          </Popup>
        )}
        {!showWeather && hover && (
          <Popup
            longitude={hover.lng}
            latitude={hover.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            offset={10}
            className="map-popup"
          >
            <strong>{formatCount(hover.cell.value)}</strong> {cellUnit ?? "VIIRS-equivalent hotspots"}
            <br />
            {cellDate && <>{cellDate} · </>}Cell {hover.cell.id}
            {hover.cell.estimated && " · Estimated from MODIS"}
            {hover.cell.estimated && hover.cell.ci_low != null && hover.cell.ci_high != null && (
              <>
                {" "}
                · 90% interval {formatCount(hover.cell.ci_low)} to {formatCount(hover.cell.ci_high)}
              </>
            )}
            {hover.cell.satellite && <> · {hover.cell.satellite}</>}
            {hover.cell.partial && " · Partial month"}
            {cellSource && (
              <>
                <br />
                Source: {cellSource}
              </>
            )}
          </Popup>
        )}
      </Map>
      {muniOn && <CompassRing mapRef={mapRef} />}
      {liveStreaks && windField && mapReady && (
        <WindParticles mapRef={mapRef} field={windField} color={colors["--viz-wind"]} />
      )}
      {offline && <p className="map-note map-offline">Place names unavailable: showing the imagery only.</p>}
    </div>
  );
}
