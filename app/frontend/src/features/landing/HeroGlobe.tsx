import "maplibre-gl/dist/maplibre-gl.css";
import { setWorkerUrl, type ExpressionSpecification, type StyleSpecification } from "maplibre-gl";
// MapLibre looks for its worker next to its own file, which does not exist after bundling: point it at the asset.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Map, { Layer, Source, type MapRef } from "react-map-gl/maplibre";
import type { CellValue } from "../../data/api";
import { boundsToGeoJSON, cellsToGeoJSON } from "../../lib/grid";
import { prefersReducedMotion, readTokens } from "../../lib/hooks";
import { rampStep } from "../../lib/scale";
import { PILOT_BOUNDS } from "../../state/dashboard";
import { DATA_ANCHOR, boundsCenter, withDataAnchor } from "../../components/map/view";
import { driftOffset, globeFraming } from "./landingData";

setWorkerUrl(workerUrl);

/** OpenFreeMap dark (free, no key). The globe stays dark in both themes: it is the night side of the story. */
const DARK_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const STYLE_TIMEOUT_MS = 5000;
const STUDY = boundsToGeoJSON(PILOT_BOUNDS);
const [STUDY_LON, STUDY_LAT] = boundsCenter(PILOT_BOUNDS);

/**
 * The ember ramp, darkest first: on a dark globe more detections read lighter, like embers. Primitives, not the
 * --viz-seq-* tokens, because the globe does not follow the page theme.
 */
const EMBER = ["--ember-700", "--ember-600", "--ember-500", "--ember-400", "--ember-300", "--ember-200", "--ember-100"] as const;
const TOKENS = [...EMBER, "--neutral-950", "--neutral-100"] as const;

function minimalStyle(background: string): StyleSpecification {
  return withDataAnchor({
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": background } }],
  } as StyleSpecification);
}

/** The dark basemap; after 5 s, or on any failure, a plain dark background so the cells still show. */
function useDarkBasemap(background: string): StyleSpecification | null {
  const [style, setStyle] = useState<StyleSpecification | null>(null);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), STYLE_TIMEOUT_MS);
    fetch(DARK_STYLE_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Basemap style failed (${response.status})`);
        return response.json() as Promise<StyleSpecification>;
      })
      // No place names: the story is the cells, and labels would sit on top of them at this scale.
      .then((json) => !cancelled && setStyle(withDataAnchor({ ...json, layers: json.layers.filter((layer) => layer.type !== "symbol") })))
      .catch(() => !cancelled && setStyle(minimalStyle(background)))
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [background]);
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

function GlobeMap({ cells, breaks, moving }: HeroGlobeProps) {
  const colors = useMemo(() => readTokens(TOKENS), []);
  const style = useDarkBasemap(colors["--neutral-950"]);
  const mapRef = useRef<MapRef | null>(null);
  const [arrived, setArrived] = useState(false);
  const movingRef = useRef(moving);
  movingRef.current = moving;

  const cellData = useMemo(() => cellsToGeoJSON(cells.filter((cell) => cell.value > 0)), [cells]);
  const fillColor = useMemo((): ExpressionSpecification | string => {
    const classes = breaks.length + 1;
    const color = (cls: number) => colors[EMBER[rampStep(cls, classes) - 1]];
    if (breaks.length === 0) return color(classes);
    return ["step", ["get", "value"], color(1), ...breaks.flatMap((edge, i) => [edge, color(i + 2)])] as unknown as ExpressionSpecification;
  }, [colors, breaks]);

  // The opening move: from the far side of the globe toward Northeast Brazil, once. Reduced motion: framed at once.
  const onLoad = () => {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    const framing = globeFraming(canvas.clientWidth, canvas.clientHeight);
    const target = { center: [STUDY_LON, STUDY_LAT] as [number, number], zoom: framing.zoom, padding: framing.padding };
    if (prefersReducedMotion() || !movingRef.current) {
      map.jumpTo(target);
      setArrived(true);
      return;
    }
    map.once("moveend", () => setArrived(true));
    map.easeTo({ ...target, duration: 5200, easing: (t) => 1 - Math.pow(1 - t, 4) });
  };

  // Keep the framing when the window changes size (rotation to landscape, resize).
  useEffect(() => {
    const onResize = () => {
      const map = mapRef.current;
      if (!map || !arrived) return;
      const canvas = map.getCanvas();
      const framing = globeFraming(canvas.clientWidth, canvas.clientHeight);
      map.jumpTo({ zoom: framing.zoom, padding: framing.padding });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [arrived]);

  // After the opening move, a very slow drift around the study area (it never turns away from the data). Stops on
  // interaction, the pause button or reduced motion; skipped while the hero is off screen.
  useEffect(() => {
    const map = mapRef.current;
    if (!arrived || !moving || !map || prefersReducedMotion()) return;
    let frame = 0;
    let visible = true;
    let elapsed = 0;
    let last = performance.now();
    const container = map.getContainer();
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(container);
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (visible) {
        elapsed += dt;
        const center = map.getCenter();
        map.jumpTo({ center: [STUDY_LON + driftOffset(elapsed), center.lat] });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [arrived, moving]);

  if (!style) return null;

  return (
    <Map
      ref={mapRef}
      mapStyle={style}
      projection="globe"
      initialViewState={{ longitude: STUDY_LON + 95, latitude: 8, zoom: 0.6 }}
      // The page must scroll over the hero: the globe takes no input at all (no wheel, drag or touch capture).
      interactive={false}
      // Credits are written in the hero caption instead, so they stay readable and reachable.
      attributionControl={false}
      pixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
      fadeDuration={0}
      onLoad={onLoad}
      style={{ width: "100%", height: "100%" }}
    >
      <Source id="hero-cells" type="geojson" data={cellData}>
        <Layer id="hero-cells-fill" type="fill" beforeId={DATA_ANCHOR} paint={{ "fill-color": fillColor, "fill-opacity": 0.92 }} />
      </Source>
      <Source id="hero-study" type="geojson" data={STUDY}>
        <Layer
          id="hero-study-line"
          type="line"
          paint={{ "line-color": colors["--neutral-100"], "line-width": 1.25, "line-opacity": 0.75, "line-dasharray": [3, 3] }}
        />
      </Source>
    </Map>
  );
}
