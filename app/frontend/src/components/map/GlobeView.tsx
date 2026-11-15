import Globe, { type GlobeMethods } from "react-globe.gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Color, MeshLambertMaterial, MeshPhongMaterial } from "three";
import type { CellValue } from "../../data/api";
import { formatCount } from "../../lib/format";
import {
  GIBS_MAX_LEVEL,
  boundsToPolygon,
  cellsToTiles,
  cornersToBounds,
  describeBounds,
  gibsTileUrl,
  tileAltitude,
  type GlobeTile,
  type LatLng,
} from "../../lib/globe";
import { L2_SIZE, type Bounds } from "../../lib/grid";
import { prefersReducedMotion, readTokens, useColorScheme } from "../../lib/hooks";
import { Button } from "../ui/Button";

type GlobeViewProps = {
  cells: readonly CellValue[];
  /** Fixed class limits from the API, the same for every month. */
  breaks: readonly number[];
  /** The selected area (shared dashboard state). */
  area: Bounds;
  onArea: (area: Bounds) => void;
};

const SEQ_TOKENS = [1, 2, 3, 4, 5, 6, 7].map((i) => `--viz-seq-${i}`);
const TOKENS = [...SEQ_TOKENS, "--viz-selection", "--color-border-strong"] as const;
/** Where the camera starts: the pilot extent, Northeast Brazil. Altitude is a fraction of the globe radius. */
const HOME = { lat: -10, lng: -41, altitude: 1.4 };
const TRANSPARENT = "rgba(0,0,0,0)";

/**
 * Whether the NASA imagery can be loaded. The globe's own tile engine cannot be observed from here and paints black
 * when a tile fails, so one tiny tile is tried first: only if it loads is the imagery switched on. Without a
 * connection the globe is still a globe, with graticules, and the credit says the imagery is missing.
 */
function useImagery(timeoutMs = 6000): "checking" | "ok" | "offline" {
  const [state, setState] = useState<"checking" | "ok" | "offline">("checking");
  useEffect(() => {
    let done = false;
    const finish = (value: "ok" | "offline") => {
      if (done) return;
      done = true;
      setState(value);
    };
    const probe = new Image();
    probe.crossOrigin = "anonymous"; // the same mode WebGL textures need
    probe.onload = () => finish("ok");
    probe.onerror = () => finish("offline");
    probe.src = gibsTileUrl(0, 0, 0);
    const timer = window.setTimeout(() => finish("offline"), timeoutMs);
    return () => {
      done = true;
      window.clearTimeout(timer);
    };
  }, [timeoutMs]);
  return state;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/**
 * Extra 3D view of the same cells as the flat map (task D3). Loaded on demand (React.lazy): three.js only downloads
 * when someone opens it. Imagery is NASA GIBS Blue Marble; the cells are tiles colored by the same classes as the map
 * and raised a little by class. The area is chosen with two clicks on opposite corners, snapped to whole cells; the
 * typed bounds in the filter bar remain the keyboard way to do the same.
 */
export default function GlobeView({ cells, breaks, area, onArea }: GlobeViewProps) {
  const scheme = useColorScheme();
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [stageRef, size] = useElementSize<HTMLDivElement>();
  const [first, setFirst] = useState<LatLng | null>(null);
  const reduceMotion = useMemo(() => prefersReducedMotion(), []);
  const imagery = useImagery();

  // Re-read the tokens whenever the theme changes; one material per step of the ramp.
  const tokens = useMemo(() => readTokens(TOKENS), [scheme]);
  const materials = useMemo(
    () =>
      SEQ_TOKENS.map(
        (name) => new MeshLambertMaterial({ color: new Color(tokens[name as (typeof TOKENS)[number]]), transparent: true, opacity: 0.94 }),
      ),
    [tokens],
  );
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);

  // The sphere itself, in a theme color: with no imagery (offline) the globe is still a globe, with graticules.
  const baseMaterial = useMemo(
    () => new MeshPhongMaterial({ color: new Color(tokens["--color-border-strong"]), shininess: 0 }),
    [tokens],
  );
  useEffect(() => () => baseMaterial.dispose(), [baseMaterial]);

  const tiles = useMemo(() => cellsToTiles(cells, breaks), [cells, breaks]);
  const areaPolygon = useMemo(() => [{ geometry: boundsToPolygon(area) }], [area]);

  const goHome = useCallback(() => {
    globeRef.current?.pointOfView(HOME, reduceMotion ? 0 : 900);
  }, [reduceMotion]);

  const onReady = useCallback(() => {
    // GIBS has no tiles below level 8; stop the engine there instead of asking for ones that do not exist.
    const engine = globeRef.current as unknown as { globeTileEngineMaxLevel?: (level: number) => unknown } | undefined;
    engine?.globeTileEngineMaxLevel?.(GIBS_MAX_LEVEL);
    goHome();
  }, [goHome]);

  const handleClick = useCallback(
    (point: { lat: number; lng: number }) => {
      if (!first) {
        setFirst({ lat: point.lat, lng: point.lng });
        return;
      }
      setFirst(null);
      onArea(cornersToBounds(first, point));
    },
    [first, onArea],
  );

  const selection = tokens["--viz-selection"];
  const hint = first
    ? "First corner set. Click the opposite corner. Esc cancels."
    : `Click two opposite corners to select an area. Now: ${describeBounds(area)}.`;

  return (
    <div
      className="globe-stage"
      ref={stageRef}
      role="group"
      aria-label="3D globe of hotspot cells. The same data is in the calendar and the table; the area can also be typed in the filter bar."
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Escape") setFirst(null);
      }}
    >
      {size.width > 0 && size.height > 0 && (
        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          backgroundColor={TRANSPARENT}
          globeMaterial={baseMaterial}
          showGraticules
          globeTileEngineUrl={imagery === "ok" ? gibsTileUrl : null}
          atmosphereColor={tokens["--color-border-strong"]}
          atmosphereAltitude={0.12}
          onGlobeReady={onReady}
          onGlobeClick={handleClick}
          tilesData={tiles}
          tileLat="lat"
          tileLng="lng"
          tileWidth={L2_SIZE}
          tileHeight={L2_SIZE}
          tileUseGlobeProjection={false}
          tileAltitude={(tile) => tileAltitude((tile as GlobeTile).step)}
          tileMaterial={(tile) => materials[(tile as GlobeTile).step - 1]}
          tilesTransitionDuration={reduceMotion ? 0 : 400}
          tileLabel={(tile) => {
            const t = tile as GlobeTile;
            const flags = [t.estimated ? "estimated from MODIS" : "observed by VIIRS", t.partial ? "partial month" : null];
            return `<b>${formatCount(t.value)}</b> hotspots<br/>${flags.filter(Boolean).join(" · ")}`;
          }}
          onTileClick={(_tile, _event, coords) => handleClick(coords)}
          polygonsData={areaPolygon}
          polygonCapColor={() => TRANSPARENT}
          polygonSideColor={() => TRANSPARENT}
          polygonStrokeColor={() => selection}
          polygonAltitude={0.045}
          // The outline is transparent but still catches clicks: forward them, or a click inside the selected
          // area could never start a new selection.
          onPolygonClick={(_polygon, _event, coords) => handleClick(coords)}
          pointsData={first ? [first] : []}
          pointLat="lat"
          pointLng="lng"
          pointColor={() => selection}
          pointAltitude={0.06}
          pointRadius={0.35}
          onPointClick={(_point, _event, coords) => handleClick(coords)}
        />
      )}

      <div className="globe-tools">
        <Button onClick={goHome}>Center on the Northeast</Button>
        {first && <Button onClick={() => setFirst(null)}>Cancel selection</Button>}
      </div>
      <div className="globe-notes">
        <p className="globe-hint" role="status">
          {hint}
        </p>
        <p className="globe-credit">
          {imagery === "ok"
            ? "Imagery: NASA GIBS, Blue Marble. Hotspots: NASA FIRMS."
            : imagery === "offline"
              ? "Imagery unavailable (no connection to NASA GIBS). Hotspots: NASA FIRMS."
              : "Loading imagery… Hotspots: NASA FIRMS."}
        </p>
      </div>
    </div>
  );
}
