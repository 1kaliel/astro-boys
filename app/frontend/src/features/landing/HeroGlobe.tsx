import "maplibre-gl/dist/maplibre-gl.css";
import {
  setWorkerUrl,
  type ExpressionSpecification,
  type LayerSpecification,
  type SourceSpecification,
  type StyleSpecification,
} from "maplibre-gl";
// MapLibre looks for its worker next to its own file, which does not exist after bundling: point it at the asset.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Map, { Layer, Marker, Source, type MapRef } from "react-map-gl/maplibre";
import type { CellValue } from "../../data/api";
import { boundsToGeoJSON, cellBounds, cellsToGeoJSON } from "../../lib/grid";
import { prefersReducedMotion, readTokens } from "../../lib/hooks";
import { rampStep } from "../../lib/scale";
import { PILOT_BOUNDS } from "../../state/dashboard";
import { DATA_ANCHOR, boundsCenter, withDataAnchor } from "../../components/map/view";
import { driftOffset, globeFraming } from "./landingData";

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
  cells: readonly CellValue[];
  /** Where the camera settles, centred in the globe's visible face: [lon, lat]. */
  focus: readonly [number, number];
  /** Label the dashed Northeast box as the validated pilot (when the cells cover more than the pilot). */
  labelPilot: boolean;
  /** Fixed class limits from the API (the same for every month). */
  breaks: readonly number[];
  /** False stops the drift for good (user interaction, pause button, reduced motion). */
  moving: boolean;
};

export function HeroGlobe(props: HeroGlobeProps) {
  return (
    <GlobeBoundary>
      <GlobeMap {...props} />
    </GlobeBoundary>
  );
}

function GlobeMap({ cells, breaks, moving, focus, labelPilot }: HeroGlobeProps) {
  const [focusLon, focusLat] = focus;
  const colors = useMemo(() => readTokens(TOKENS), []);
  const style = useGlobeStyle(colors);
  const mapRef = useRef<MapRef | null>(null);
  const [arrived, setArrived] = useState(false);
  const movingRef = useRef(moving);
  movingRef.current = moving;
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

  const shown = useMemo(() => cells.filter((cell) => cell.value > 0), [cells]);
  const cellData = useMemo(() => cellsToGeoJSON(shown), [shown]);
  // One point per cell for the glow: seen from this far a 0.25° cell is two pixels; the halo makes the fire read.
  const glowData = useMemo((): GeoJSON.FeatureCollection<GeoJSON.Point> => {
    return {
      type: "FeatureCollection",
      features: shown.map((cell) => {
        const b = cellBounds(cell.id);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [(b.west + b.east) / 2, (b.south + b.north) / 2] },
          properties: { value: cell.value },
        };
      }),
    };
  }, [shown]);
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

  const frame = () => {
    const map = mapRef.current;
    if (!map) return null;
    const canvas = map.getCanvas();
    return globeFraming(canvas.clientWidth, canvas.clientHeight);
  };

  // The opening move: 2.5 s from the Americas to Northeast Brazil, once. Reduced motion or a hidden tab: framed at once.
  const onLoad = () => {
    const map = mapRef.current;
    const framing = frame();
    if (!map || !framing) return;
    const target = { center: [focusLon, focusLat] as [number, number], zoom: framing.zoom, padding: framing.padding };
    if (prefersReducedMotion() || !movingRef.current || document.hidden) {
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
      const framing = frame();
      if (!map || !framing || !arrived) return;
      map.jumpTo({ zoom: framing.zoom, padding: framing.padding });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [arrived]);

  // After the opening move, a very slow drift of a few degrees around the study area (Brazil never leaves the face).
  // Stops on interaction, the pause button or reduced motion; skipped while the hero is off screen.
  useEffect(() => {
    const map = mapRef.current;
    if (!arrived || !moving || !map || prefersReducedMotion()) return;
    let raf = 0;
    let visible = true;
    let elapsed = 0;
    let last = performance.now();
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(map.getContainer());
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (visible) {
        elapsed += dt;
        map.jumpTo({ center: [focusLon + driftOffset(elapsed), focusLat] });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [arrived, moving, focusLon, focusLat]);

  // A new focus after the opening (the Brazil file failed and the pilot cells took over): move there.
  const placed = useRef(`${focusLon},${focusLat}`);
  useEffect(() => {
    const map = mapRef.current;
    const key = `${focusLon},${focusLat}`;
    if (!map || !arrived || placed.current === key) return;
    placed.current = key;
    map.easeTo({ center: [focusLon, focusLat], duration: prefersReducedMotion() ? 0 : 1200 });
  }, [arrived, focusLon, focusLat]);

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
      // The page must scroll over the hero: the globe takes no input at all (no wheel, drag or touch capture).
      interactive={false}
      // Credits are written in the hero caption instead, so they stay readable and reachable.
      attributionControl={false}
      pixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
      // Keeps the last frame readable for screenshots and page captures (the globe is the first impression).
      canvasContextAttributes={{ preserveDrawingBuffer: true }}
      fadeDuration={0}
      onLoad={onLoad}
      style={{ width: "100%", height: "100%" }}
    >
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
    </Map>
  );
}
