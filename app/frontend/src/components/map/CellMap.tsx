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
import type {
  LiveWindResponse,
  MunicipalitiesGeoJSON,
  MunicipalitiesWeather,
  WeatherGridResponse,
} from "../../data/api";
import { formatCount } from "../../lib/format";
import {
  boundsToGeoJSON,
  cellOutlinesGeoJSON,
  cellsInBounds,
  cellsToGeoJSON,
  type Bounds,
  type CellFeatureProps,
} from "../../lib/grid";
import { prefersReducedMotion, readTokens, useColorScheme, type ColorScheme } from "../../lib/hooks";
import { FEELS_LIKE_BREAKS, centroidPoints, joinWeather } from "../../lib/municipalities";
import { rampStep } from "../../lib/scale";
import { LAYER_LABEL, breaksOf, unitOf, weatherGeoJSON, type MapLayer } from "../../lib/weatherLayers";
import { WindField } from "../../lib/windField";
import { CompassRing } from "./CompassRing";
import { WindParticles } from "./WindParticles";
import { PILOT_BOUNDS } from "../../state/dashboard";

setWorkerUrl(workerUrl);

/** OpenFreeMap: free, no key, provided as-is. Attribution comes with the style and stays visible. */
const STYLE_URLS: Record<ColorScheme, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const STYLE_TIMEOUT_MS = 5000;

const SEQ_TOKENS = [1, 2, 3, 4, 5, 6, 7].map((i) => `--viz-seq-${i}`);
const WX_TOKENS = [1, 2, 3, 4, 5, 6, 7].map((i) => `--wx-seq-${i}`);
const TOKENS = [
  ...SEQ_TOKENS,
  ...WX_TOKENS,
  "--viz-selection",
  "--color-surface",
  "--color-text-primary",
  "--color-border-strong",
] as const;

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
/** The region of the live wind layer, until the API says it (it is wider than the study area). */
/** How far the map is tilted while the municipalities are shown (degrees; MapLibre allows up to 60). */
const MUNI_PITCH = 50;
const LIVE_REGION: Bounds = { west: -75, south: -35, east: -25, north: 8 };

function minimalStyle(background: string): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": background },
      },
    ],
  };
}

/** Loads the basemap style; falls back to a plain background so the cells still show if the service is down. */
function useBasemap(scheme: ColorScheme): {
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
    fetch(STYLE_URLS[scheme], { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Basemap style failed (${response.status})`);
        return response.json() as Promise<StyleSpecification>;
      })
      .then((style) => !cancelled && setState({ style, offline: false }))
      .catch(() => {
        if (cancelled) return;
        setState({
          style: minimalStyle(readTokens(["--color-surface"])["--color-surface"]),
          offline: true,
        });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [scheme]);
  return state;
}

type CellMapProps = {
  mapRef: RefObject<MapRef | null>;
  cells: readonly CellFeatureProps[];
  /** Fixed, strictly increasing class limits from the API (the same for every month). */
  breaks: readonly number[];
  area: Bounds;
  projection: "mercator" | "globe"; // the MapLibre projections; the 3D view is GlobeView
  /** What is drawn: the hotspot cells (default) or one ERA5 weather layer. Never both at once. */
  layer?: MapLayer;
  /** ERA5 monthly means at sampled points, for the weather layers. */
  weather?: WeatherGridResponse | null;
  /** The live wind of a wide region: animated streaks (static arrows when the user prefers reduced motion). */
  live?: LiveWindResponse | null;
  /** A state's municipalities (IBGE) colored by the current feels-like temperature: a tilted view with a compass. */
  municipal?: { geo: MunicipalitiesGeoJSON; weather: MunicipalitiesWeather | null } | null;
};

type Hover = { lng: number; lat: number; cell: CellFeatureProps };

export function CellMap({
  mapRef,
  cells,
  breaks,
  area,
  projection,
  layer = "hotspots",
  weather = null,
  live = null,
  municipal = null,
}: CellMapProps) {
  const scheme = useColorScheme();
  const { style, offline } = useBasemap(scheme);
  // Re-read the tokens whenever the theme changes.
  const colors = useMemo(() => readTokens(TOKENS), [scheme]);
  const [hover, setHover] = useState<Hover | null>(null);
  const [wxHover, setWxHover] = useState<{
    lng: number;
    lat: number;
    props: Record<string, unknown>;
  } | null>(null);
  const muniOn = layer === "municipalities";
  const hideCells = layer !== "hotspots";
  const showWeather = layer !== "hotspots" && !muniOn;
  const liveOn = layer === "live-wind";
  const [muniHover, setMuniHover] = useState<{ lng: number; lat: number; props: Record<string, unknown> } | null>(null);
  const muniShapes = useMemo(() => (municipal ? joinWeather(municipal.geo, municipal.weather) : null), [municipal]);
  const muniPoints = useMemo(
    () => (municipal && muniShapes ? centroidPoints(municipal.geo, muniShapes) : null),
    [municipal, muniShapes],
  );
  // The teal ramp of the weather layers, one color per class of feels-like; no value gets the neutral "no data" color.
  const muniFill = useMemo((): ExpressionSpecification => {
    const color = (cls: number) =>
      colors[`--wx-seq-${rampStep(cls, FEELS_LIKE_BREAKS.length + 1)}` as (typeof TOKENS)[number]];
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
  const wxData = useMemo(
    () => weatherGeoJSON((liveOn ? live?.points : weather?.points) ?? [], layer),
    [weather, live, layer, liveOn],
  );
  const windField = useMemo(() => (live ? new WindField(live.points) : null), [live]);
  const wxFill = useMemo((): ExpressionSpecification | string => {
    const limits = breaksOf(layer);
    const color = (cls: number) => colors[`--wx-seq-${rampStep(cls, limits.length + 1)}` as (typeof TOKENS)[number]];
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

  // Follow the selected area, or show the whole wide region while the live wind is on (no animation when the user
  // asked for reduced motion).
  const target = muniOn && municipal ? municipal.geo.bounds : liveOn ? (live?.region ?? LIVE_REGION) : area;
  useEffect(() => {
    mapRef.current?.fitBounds(
      [
        [target.west, target.south],
        [target.east, target.north],
      ],
      // The municipalities are seen from an angle (a tilted map); every other layer is flat and north up.
      { padding: 24, duration: prefersReducedMotion() ? 0 : 400, pitch: muniOn ? MUNI_PITCH : 0, bearing: 0 },
    );
  }, [target.west, target.south, target.east, target.north, muniOn, mapRef]);

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
        projection={projection}
        maxBounds={projection === "mercator" ? MERCATOR_LIMITS : undefined}
        minZoom={projection === "globe" ? 1 : 3}
        maxZoom={10}
        dragRotate={muniOn}
        pitchWithRotate={muniOn}
        touchPitch={muniOn}
        pixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
        fadeDuration={0}
        attributionControl={{ compact: true }}
        interactiveLayerIds={
          muniOn ? ["muni-fill"] : liveStreaks ? [] : showWeather ? [arrows ? "wx-arrow" : "wx-circle"] : ["cells-fill"]
        }
        onMouseMove={muniOn ? onMuniPointer : showWeather ? onWeatherPointer : onPointer}
        onClick={muniOn ? onMuniPointer : showWeather ? onWeatherPointer : onPointer}
        onMouseLeave={() => {
          setMuniHover(null);
          setHover(null);
          setWxHover(null);
        }}
        onLoad={(event) => {
          event.target.touchZoomRotate.disableRotation();
          event.target.keyboard.disableRotation();
          // The arrow image has to exist again after every basemap style change: add it when the map asks for it.
          event.target.on("styleimagemissing", (missing) => {
            if (missing.id !== "wind-arrow") return;
            const image = windArrow();
            if (image && !event.target.hasImage("wind-arrow"))
              event.target.addImage("wind-arrow", image, { sdf: true });
          });
        }}
        cursor={hover || wxHover ? "pointer" : "grab"}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <Source id="cells" type="geojson" data={cellData}>
          {/* No stroke around cells: an estimated month is flagged once (badge), not on thousands of cells. */}
          <Layer
            id="cells-fill"
            type="fill"
            layout={{ visibility: hideCells ? "none" : "visible" }}
            paint={{ "fill-color": fillColor, "fill-opacity": 0.85 }}
          />
        </Source>
        {showWeather && !liveStreaks && (
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
                  "icon-color": colors["--color-text-primary"],
                  "icon-halo-color": colors["--color-surface"],
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
                  "circle-stroke-width": 1,
                  "circle-opacity": 0.95,
                }}
              />
            )}
          </Source>
        )}
        {muniOn && muniShapes && muniPoints && (
          <>
            <Source id="municipalities" type="geojson" data={muniShapes}>
              <Layer id="muni-fill" type="fill" paint={{ "fill-color": muniFill, "fill-opacity": 0.55 }} />
              <Layer
                id="muni-line"
                type="line"
                paint={{ "line-color": colors["--color-text-primary"], "line-width": 0.6, "line-opacity": 0.45 }}
              />
            </Source>
            <Source id="municipality-centres" type="geojson" data={muniPoints}>
              <Layer
                id="muni-centre"
                type="circle"
                paint={{
                  "circle-color": muniFill,
                  "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 7, 5.5, 9, 11],
                  "circle-stroke-color": colors["--color-text-primary"],
                  "circle-stroke-width": 1,
                  "circle-opacity": 0.95,
                }}
              />
            </Source>
          </>
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
            <strong>{formatCount(hover.cell.value)}</strong> VIIRS-equivalent hotspots
            <br />
            Cell {hover.cell.id}
            {hover.cell.estimated && " · Estimated from MODIS"}
            {hover.cell.partial && " · Partial month"}
          </Popup>
        )}
      </Map>
      {muniOn && <CompassRing mapRef={mapRef} />}
      {liveStreaks && windField && (
        <WindParticles mapRef={mapRef} field={windField} color={colors["--color-text-primary"]} />
      )}
      {offline && <p className="map-note map-offline">Basemap unavailable: showing the cells only.</p>}
    </div>
  );
}
