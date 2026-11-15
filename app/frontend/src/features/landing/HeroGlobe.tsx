import "maplibre-gl/dist/maplibre-gl.css";
import {
  setWorkerUrl,
  type ExpressionSpecification,
  type Map as MapLibreMap,
  type LayerSpecification,
  type SourceSpecification,
  type StyleSpecification,
} from "maplibre-gl";
// MapLibre looks for its worker next to its own file, which does not exist after bundling: point it at the asset.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { CellValue } from "../../data/api";
import { boundsToGeoJSON, cellBounds, cellsToGeoJSON } from "../../lib/grid";
import { prefersReducedMotion, readTokens } from "../../lib/hooks";
import { rampStep } from "../../lib/scale";
import { PILOT_BOUNDS } from "../../state/dashboard";
import { DATA_ANCHOR, boundsCenter, withDataAnchor } from "../../components/map/view";
import { formatCount } from "../../lib/format";
import { driftOffset, globeFraming, rotationActive } from "./landingData";

setWorkerUrl(workerUrl);

/**
 * OpenFreeMap (free, no key): only its tile sources are used. The globe has its own night style in both themes:
 * lit land with shaded relief, dark sea, pale coastlines, no place names (the story is the cells).
 */
const BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const STYLE_TIMEOUT_MS = 5000;
const STUDY = boundsToGeoJSON(PILOT_BOUNDS);
const [PILOT_LON] = boundsCenter(PILOT_BOUNDS);
/** The camera opens already facing the Americas, a little west and north of where it settles. */
const OPEN_FROM = { dLon: -28, dLat: 10, zoomOut: 0.5 } as const;
const EASE_MS = 2500;
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * The ember ramp, darkest first: on a dark globe more detections read lighter, like embers. Primitives, not the
 * --viz-seq-* tokens, because the globe does not follow the page theme.
 */
const EMBER = ["--ember-700", "--ember-600", "--ember-500", "--ember-400", "--ember-300", "--ember-200", "--ember-100"] as const;
const SCENE = ["--neutral-950", "--neutral-900", "--neutral-300", "--neutral-100"] as const;
const TOKENS = [...EMBER, ...SCENE] as const;
type Colors = Record<(typeof TOKENS)[number], string>;

/** The night globe. Without the tile service (`base` null): land color only, the cells still show. */
function globeStyle(base: StyleSpecification | null, c: Colors): StyleSpecification {
  const sources: Record<string, SourceSpecification> = {};
  // The sphere starts as sea; the shaded relief brings up the land, the sea layer darkens the water over it. Without
  // tiles it stays a dark sphere under the cells, never a flat gray disc.
  const layers: LayerSpecification[] = [{ id: "sphere", type: "background", paint: { "background-color": c["--neutral-900"] } }];
  const tiles = base?.sources?.openmaptiles;
  const relief = base?.sources?.ne2_shaded;
  if (relief) {
    sources.relief = relief;
    layers.push({
      id: "relief",
      type: "raster",
      source: "relief",
      paint: { "raster-saturation": -0.9, "raster-brightness-max": 0.5, "raster-contrast": 0.2, "raster-opacity": 0.85 },
    });
  }
  if (tiles) {
    sources.openmaptiles = tiles;
    layers.push(
      { id: "sea", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": c["--neutral-900"], "fill-opacity": 0.94 } },
      {
        id: "coast",
        type: "line",
        source: "openmaptiles",
        "source-layer": "water",
        paint: { "line-color": c["--neutral-300"], "line-opacity": 0.5, "line-width": 0.7 },
      },
      {
        id: "borders",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary",
        filter: ["==", ["get", "admin_level"], 2],
        paint: { "line-color": c["--neutral-300"], "line-opacity": 0.22, "line-width": 0.6 },
      },
    );
  }
  return withDataAnchor({ version: 8, sources, layers } as StyleSpecification);
}

/** Fetches the tile sources; after 5 s, or on any failure, the plain globe (land color, cells, outline). */
function useGlobeStyle(colors: Colors): StyleSpecification | null {
  const [style, setStyle] = useState<StyleSpecification | null>(null);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), STYLE_TIMEOUT_MS);
    fetch(BASE_STYLE_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Basemap style failed (${response.status})`);
        return response.json() as Promise<StyleSpecification>;
      })
      .then((json) => !cancelled && setStyle(globeStyle(json, colors)))
      .catch(() => !cancelled && setStyle(globeStyle(null, colors)))
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [colors]);
  return style;
}

/** Without WebGL MapLibre throws while it starts: keep the dark scene and the text instead of a broken page. */
class GlobeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type HeroGlobeProps = {
  /** One set of cells per frame of the timeline (one set only when there is no timeline). Computed once. */
  frames: readonly (readonly CellValue[])[];
  /** The frame on screen. */
  frame: number;
  /** Fixed class limits (the same for every frame). */
  breaks: readonly number[];
  /** Where the camera settles, centred in the globe's visible face: [lon, lat]. */
  focus: readonly [number, number];
  /** Label the dashed Northeast box as the validated pilot (when the cells cover more than the pilot). */
  labelPilot: boolean;
  /** False: no auto-rotation (paused, or reduced motion). The user can still drag and zoom. */
  playing: boolean;
  /** For the cell tooltip: "Sep 2024", and whether the numbers come from the experimental run. */
  monthShort: string;
  experimental: boolean;
};

type Hover = { lng: number; lat: number; value: number };

export function HeroGlobe(props: HeroGlobeProps) {
  return (
    <GlobeBoundary>
      <GlobeMap {...props} />
    </GlobeBoundary>
  );
}

function pointsOf(cells: readonly CellValue[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: cells.map((cell) => {
      const b = cellBounds(cell.id);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [(b.west + b.east) / 2, (b.south + b.north) / 2] },
        properties: { value: cell.value },
      };
    }),
  };
}

const ZOOM_HINTS = {
  "CooperativeGesturesHandler.WindowsHelpText": "Ctrl + scroll to zoom the globe",
  "CooperativeGesturesHandler.MacHelpText": "⌘ + scroll to zoom the globe",
  "CooperativeGesturesHandler.MobileHelpText": "Use two fingers to turn the globe",
};

function GlobeMap({ frames, frame, breaks, playing, focus, labelPilot, monthShort, experimental }: HeroGlobeProps) {
  const [focusLon, focusLat] = focus;
  const colors = useMemo(() => readTokens(TOKENS), []);
  const style = useGlobeStyle(colors);
  const mapRef = useRef<MapRef | null>(null);
  const [arrived, setArrived] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  /** Time of the last drag, zoom, touch or cell hover on the globe: auto-rotation waits ROTATION_RESUME_MS after it. */
  const lastInteraction = useRef<number | null>(null);
  // The first frame is already framed for this screen and facing the Americas, so there is never an empty scene.
  const opening = useMemo(() => {
    const framing = globeFraming(window.innerWidth, window.innerHeight);
    return {
      longitude: focusLon + OPEN_FROM.dLon,
      latitude: focusLat + OPEN_FROM.dLat,
      zoom: framing.zoom - OPEN_FROM.zoomOut,
      padding: framing.padding,
    };
    // The opening frame only: later focus changes ease the camera (see the effect below).
  }, []);

  // Every frame's GeoJSON is built once; changing month only hands the source another object (MapLibre setData).
  const fills = useMemo(() => frames.map((cells) => cellsToGeoJSON(cells.filter((c) => c.value > 0))), [frames]);
  // One point per cell for the glow: seen from this far a 0.25 degree cell is two pixels; the halo makes the fire read.
  const glows = useMemo(() => frames.map((cells) => pointsOf(cells.filter((c) => c.value > 0))), [frames]);
  const at = Math.min(Math.max(0, frame), Math.max(0, fills.length - 1));
  const cellData = fills[at] ?? EMPTY;
  const glowData = glows[at] ?? EMPTY;
  // A new month: the hovered value would be stale.
  useEffect(() => setHover(null), [at]);

  const fillColor = useMemo((): ExpressionSpecification | string => {
    const classes = breaks.length + 1;
    const color = (cls: number) => colors[EMBER[rampStep(cls, classes) - 1]];
    if (breaks.length === 0) return color(classes);
    return ["step", ["get", "value"], color(1), ...breaks.flatMap((edge, i) => [edge, color(i + 2)])] as unknown as ExpressionSpecification;
  }, [colors, breaks]);
  // The glow only around the busier cells (upper half of the classes), so it marks where the fire was, not everywhere.
  const glowOpacity = useMemo((): ExpressionSpecification | number => {
    const from = breaks[Math.floor(breaks.length / 2)];
    return from == null ? 0.35 : (["case", [">=", ["get", "value"], from], 0.4, 0] as unknown as ExpressionSpecification);
  }, [breaks]);

  const frameFor = () => {
    const map = mapRef.current;
    if (!map) return null;
    const canvas = map.getCanvas();
    return globeFraming(canvas.clientWidth, canvas.clientHeight);
  };

  // The opening move: 2.5 s from the Americas to Brazil, once. Reduced motion, paused or a hidden tab: framed at once.
  const onLoad = (event: { target: MapLibreMap }) => {
    const map = event.target;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    const framing = frameFor();
    if (!framing) return;
    const target = { center: [focusLon, focusLat] as [number, number], zoom: framing.zoom, padding: framing.padding };
    if (prefersReducedMotion() || !playingRef.current || document.hidden) {
      map.jumpTo(target);
      setArrived(true);
      return;
    }
    map.once("moveend", () => setArrived(true));
    map.easeTo({ ...target, duration: EASE_MS, easing: (t) => 1 - Math.pow(1 - t, 3) });
  };

  // Keep the framing when the window changes size (rotation to landscape, resize).
  useEffect(() => {
    const onResize = () => {
      const map = mapRef.current;
      const framing = frameFor();
      if (!map || !framing || !arrived) return;
      map.jumpTo({ zoom: framing.zoom, padding: framing.padding });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [arrived]);

  // User gestures (they carry an originalEvent; the rotation's own camera moves do not) hold the rotation back.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !arrived) return;
    const touched = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) lastInteraction.current = performance.now();
    };
    const pressed = () => {
      lastInteraction.current = performance.now();
    };
    map.on("movestart", touched);
    map.on("move", touched);
    map.on("mousedown", pressed);
    map.on("touchstart", pressed);
    return () => {
      map.off("movestart", touched);
      map.off("move", touched);
      map.off("mousedown", pressed);
      map.off("touchstart", pressed);
    };
  }, [arrived]);

  // Auto-rotation: a slow back-and-forth sweep of a few degrees around wherever the globe was left, so Brazil stays
  // in view unless the user turned it away. Waits 4 s after the last interaction; skipped while off screen.
  useEffect(() => {
    const map = mapRef.current;
    if (!arrived || !playing || !map || prefersReducedMotion()) return;
    let raf = 0;
    let visible = true;
    let phase = 0;
    let base: number | null = null;
    let last = performance.now();
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(map.getContainer());
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (!visible || !rotationActive(true, lastInteraction.current, now)) {
        base = null; // resume from wherever the user leaves the globe
      } else {
        const center = map.getCenter();
        if (base == null) base = center.lng - driftOffset(phase);
        phase += dt;
        map.jumpTo({ center: [base + driftOffset(phase), center.lat] });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [arrived, playing]);

  // A new focus after the opening (the Brazil file failed and the pilot cells took over): move there.
  const placed = useRef(`${focusLon},${focusLat}`);
  useEffect(() => {
    const map = mapRef.current;
    const key = `${focusLon},${focusLat}`;
    if (!map || !arrived || placed.current === key) return;
    placed.current = key;
    map.easeTo({ center: [focusLon, focusLat], duration: prefersReducedMotion() ? 0 : 1200 });
  }, [arrived, focusLon, focusLat]);

  const hoverAt = (event: MapLayerMouseEvent): Hover | null => {
    const feature = event.features?.[0];
    if (!feature) return null;
    const value = Number((feature.properties as Record<string, unknown>).value);
    return Number.isFinite(value) ? { lng: event.lngLat.lng, lat: event.lngLat.lat, value } : null;
  };

  if (!style) return null;

  return (
    <Map
      ref={mapRef}
      mapStyle={style}
      projection="globe"
      initialViewState={opening}
      // A soft atmosphere around the sphere; space stays the page's night color.
      sky={{
        "sky-color": colors["--neutral-950"],
        "horizon-color": colors["--neutral-300"],
        "sky-horizon-blend": 0.6,
        "atmosphere-blend": 0.9,
      }}
      // Drag turns the globe. The page keeps the plain wheel and one-finger scroll: zoom is Ctrl/Cmd + wheel, pinch or
      // the buttons, and on touch the globe turns with two fingers (MapLibre's cooperative gestures show the hint).
      cooperativeGestures
      locale={ZOOM_HINTS}
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      minZoom={0.8}
      maxZoom={7}
      interactiveLayerIds={["hero-cells-fill"]}
      onMouseMove={(event) => {
        const next = hoverAt(event);
        if (next) lastInteraction.current = performance.now();
        setHover(next);
      }}
      onMouseLeave={() => setHover(null)}
      onClick={(event) => setHover(hoverAt(event))}
      cursor={hover ? "pointer" : "grab"}
      // Credits are written in the hero caption instead, so they stay readable and reachable.
      attributionControl={false}
      pixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
      // Keeps the last frame readable for screenshots and page captures (the globe is the first impression).
      canvasContextAttributes={{ preserveDrawingBuffer: true }}
      fadeDuration={0}
      onLoad={onLoad}
      style={{ width: "100%", height: "100%" }}
    >
      <NavigationControl position="top-right" showCompass={false} />
      <Source id="hero-glow" type="geojson" data={glowData}>
        <Layer
          id="hero-glow"
          type="circle"
          beforeId={DATA_ANCHOR}
          paint={{
            "circle-color": fillColor,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2, 3, 5, 5, 10],
            "circle-blur": 1,
            "circle-opacity": glowOpacity,
            "circle-pitch-alignment": "map",
          }}
        />
      </Source>
      <Source id="hero-cells" type="geojson" data={cellData}>
        <Layer id="hero-cells-fill" type="fill" beforeId={DATA_ANCHOR} paint={{ "fill-color": fillColor, "fill-opacity": 1 }} />
      </Source>
      <Source id="hero-study" type="geojson" data={STUDY}>
        <Layer
          id="hero-study-line"
          type="line"
          paint={{ "line-color": colors["--neutral-100"], "line-width": 1.5, "line-opacity": 0.9, "line-dasharray": [3, 2] }}
        />
      </Source>
      {labelPilot && (
        <Marker longitude={PILOT_LON} latitude={PILOT_BOUNDS.north} anchor="bottom" offset={[0, -4]} style={{ pointerEvents: "none" }}>
          <span className="hero-pilot-label" aria-hidden="true">
            Validated pilot
          </span>
        </Marker>
      )}
      {hover && (
        <Popup
          longitude={hover.lng}
          latitude={hover.lat}
          closeButton={false}
          closeOnClick={false}
          anchor="bottom"
          offset={10}
          className="hero-popup"
        >
          {"≈"} {formatCount(hover.value)} VIIRS-equivalent hotspots · {monthShort} · 0.25° cell
          {experimental ? " · experimental" : ""}
        </Popup>
      )}
    </Map>
  );
}
