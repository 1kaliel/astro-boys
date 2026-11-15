import "maplibre-gl/dist/maplibre-gl.css";
import { setWorkerUrl, type ExpressionSpecification, type StyleSpecification } from "maplibre-gl";
// MapLibre looks for its worker next to its own file, which does not exist after bundling: point it at the asset.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import type { DrilldownResponse } from "../../data/api";
import { formatCount } from "../../lib/format";
import {
  boundsToGeoJSON,
  cellBounds,
  cellOutlinesGeoJSON,
  l3Bounds,
  cellsInBounds,
  cellsToGeoJSON,
  type Bounds,
  type CellFeatureProps,
} from "../../lib/grid";
import { prefersReducedMotion, readTokens, useColorScheme, useMediaQuery, type ColorScheme } from "../../lib/hooks";
import { drillStep, rampStep } from "../../lib/scale";
import { PILOT_BOUNDS } from "../../state/dashboard";
import { blockBounds, blockGeoJSON, l3GeoJSON, nativeDetections, satelliteName, type DrillCellProps } from "./drill";
import {
  GLOBE_FLY_IN_BELOW_ZOOM,
  L3_ZOOM_OFFSET,
  boundsCenter,
  cellFillOpacityExpression,
  focusActive,
  focusCellAt,
  globeZoomToFit,
  gridOutlineOpacityExpression,
  insideBounds,
  isFocusOf,
  withDataAnchor,
  DATA_ANCHOR,
} from "./view";

setWorkerUrl(workerUrl);

/** OpenFreeMap: free, no key, provided as-is. Attribution comes with the style and stays visible. */
const STYLE_URLS: Record<ColorScheme, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const STYLE_TIMEOUT_MS = 5000;

const SEQ_TOKENS = [1, 2, 3, 4, 5, 6, 7].map((i) => `--viz-seq-${i}`);
const TOKENS = [...SEQ_TOKENS, "--viz-selection", "--color-surface", "--color-text-secondary", "--viz-cell-outline"] as const;
type Token = (typeof TOKENS)[number];

/** Layers the pointer reads: the harmonized L2 cells, or, in the drill-down, the L3 cells and the 3 x 3 block. */
const L2_LAYERS = ["cells-fill"];
const DRILL_LAYERS = ["drill-l3-hit", "drill-block-hit"];
const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Below this map width the compact attribution starts folded (the "i" button), so it does not cover the cells. */
const NARROW_MAP_PX = 640;
const STUDY_DATA = boundsToGeoJSON(PILOT_BOUNDS);
const [STUDY_LON, STUDY_LAT] = boundsCenter(PILOT_BOUNDS);
const GRID_OPACITY = gridOutlineOpacityExpression() as unknown as ExpressionSpecification;

/** Max zoom 12: an L2 cell is about 1,450 px and an L3 sub-cell about 360 px wide, enough to read the roads and the
 * terrain inside them. Precision stays where the data are: estimates are drawn only as whole 0.25° cells, and the
 * 0.0625° sub-cells only show native detections. */
const MAX_ZOOM = 12;

/** Pan limits in the flat view, [west, south, east, north]: the pilot extent with a margin. */
const MERCATOR_LIMITS: [number, number, number, number] = [-56, -26, -27, 6];

function minimalStyle(background: string): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": background } }],
  };
  return withDataAnchor(style);
}

/** Loads the basemap style; falls back to a plain background so the cells still show if the service is down. */
function useBasemap(scheme: ColorScheme): { style: StyleSpecification | null; offline: boolean } {
  const [state, setState] = useState<{ style: StyleSpecification | null; offline: boolean }>({ style: null, offline: false });
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), STYLE_TIMEOUT_MS);
    fetch(STYLE_URLS[scheme], { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Basemap style failed (${response.status})`);
        return response.json() as Promise<StyleSpecification>;
      })
      // The data layers go under the place names: before a hidden anchor at the start of the label layers.
      .then((style) => !cancelled && setState({ style: withDataAnchor(style), offline: false }))
      .catch(() => {
        if (cancelled) return;
        setState({ style: minimalStyle(readTokens(["--color-surface"])["--color-surface"]), offline: true });
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

/** The drill-down on screen: the L2 cell, the API answer once it is in (null while loading or on error), and the
 * class limits of its L3 counts. */
export type DrillView = { cell: string; data: DrilldownResponse | null; breaks: readonly number[]; failed: boolean };

type CellMapProps = {
  mapRef: RefObject<MapRef | null>;
  cells: readonly CellFeatureProps[];
  /** Fixed, strictly increasing class limits from the API (the same for every month). */
  breaks: readonly number[];
  area: Bounds;
  projection: "mercator" | "globe";
  /** Null = the harmonized L2 map. Otherwise only native detections are drawn, never the harmonized layer. */
  drill: DrillView | null;
  /** Click on an L2 cell (or on a neighbor in the drill-down): show its L3 sub-cells. */
  onDrill: (cell: string) => void;
  /** "September 2013": the month on the map, for the focus chip. */
  monthLabel: string | null;
  /** What a cell value counts, for the chips: "VIIRS-equivalent hotspots" or "native Aqua MODIS detections". */
  countLabel?: string;
  /** True while the user draws an area: no focus chip (the drawing hint takes its place). */
  suppressFocus?: boolean;
};

type Hover = { lng: number; lat: number } & (
  | { kind: "l2"; cell: CellFeatureProps }
  | { kind: "block"; id: string; count: number | null; target: boolean }
  | { kind: "l3"; id: string; count: number }
);

const isTrue = (value: unknown) => value === true || value === "true";
/** GeoJSON properties come back from MapLibre serialized: a null may arrive as missing or as "null". */
const countOf = (value: unknown) => (value == null || value === "null" ? null : Number(value));

export function CellMap({ mapRef, cells, breaks, area, projection, drill, onDrill, monthLabel, countLabel = "VIIRS-equivalent hotspots", suppressFocus }: CellMapProps) {
  const scheme = useColorScheme();
  const { style, offline } = useBasemap(scheme);
  // The data layers go under the basemap's place names (the offline style has none: then on top).
  const beforeId = DATA_ANCHOR;
  // A mouse can point at a cell; a finger cannot hover, so touch screens focus the cell at the map center.
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  // Re-read the tokens whenever the theme changes.
  const colors = useMemo(() => readTokens(TOKENS), [scheme]);
  const [hover, setHover] = useState<Hover | null>(null);
  const drillCell = drill?.cell ?? null;
  const drillData = drill && drill.data?.cell === drill.cell ? drill.data : null;

  // Focus on the cell you zoom into: once a cell (an L3 sub-cell in the drill-down) is 64 px wide, the cell at the
  // map center, or under the mouse, is outlined and described in a chip. Ids only change when the cell changes, so
  // panning does not re-render the map on every frame. `pointer` undefined = no mouse over the map.
  const [focusOn, setFocusOn] = useState(false);
  const [centerFocus, setCenterFocus] = useState<string | null>(null);
  const [pointer, setPointer] = useState<string | null | undefined>(undefined);
  const updateFocus = useCallback(
    (lng: number, lat: number, zoom: number) => {
      setFocusOn(focusActive(zoom, drillCell ? L3_ZOOM_OFFSET : 0));
      setCenterFocus(focusCellAt(lng, lat, PILOT_BOUNDS, drillCell));
    },
    [drillCell],
  );
  useEffect(() => {
    setPointer(undefined);
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    updateFocus(center.lng, center.lat, map.getZoom());
  }, [updateFocus, mapRef]);
  const candidate = pointer !== undefined ? pointer : centerFocus;
  const focusReady = drillCell ? Boolean(drillData?.subdivided) && !drill?.failed : true;
  const focusId = focusOn && focusReady && !suppressFocus && isFocusOf(candidate, drillCell) ? candidate : null;
  const focusData = useMemo(
    () => (focusId ? boundsToGeoJSON(drillCell ? l3Bounds(focusId) : cellBounds(focusId)) : EMPTY_FC),
    [focusId, drillCell],
  );
  const cellById = useMemo(() => new globalThis.Map(cells.map((cell) => [cell.id, cell])), [cells]);
  const l3Counts = useMemo(() => new globalThis.Map((drillData?.l3 ?? []).map((c) => [c.id, c.count])), [drillData]);
  // Strong at the overview, translucent once zoomed in (the basemap reads through); the others dimmed a little
  // while a cell has the focus.
  const cellOpacity = useMemo(
    () => cellFillOpacityExpression(0, drillCell ? null : focusId) as unknown as ExpressionSpecification,
    [drillCell, focusId],
  );
  const l3Opacity = useMemo(
    () => cellFillOpacityExpression(L3_ZOOM_OFFSET, drillCell ? focusId : null) as unknown as ExpressionSpecification,
    [drillCell, focusId],
  );

  // Zero detections are not drawn: "no detection" (never "no fire"), and empty areas stay empty.
  const cellData = useMemo(() => cellsToGeoJSON(cells.filter((cell) => cell.value > 0)), [cells]);
  const areaData = useMemo(() => boundsToGeoJSON(area), [area]);
  // The L2 cells of the area, one outline each: what the calendar and KPIs sum, drawn on the map.
  const areaCellData = useMemo(() => cellOutlinesGeoJSON(cellsInBounds(area)), [area]);

  const fillColor = useMemo((): ExpressionSpecification | string => {
    const classes = breaks.length + 1;
    const color = (cls: number) => colors[`--viz-seq-${rampStep(cls, classes)}` as (typeof TOKENS)[number]];
    if (breaks.length === 0) return color(1);
    return ["step", ["get", "value"], color(1), ...breaks.flatMap((edge, i) => [edge, color(i + 2)])] as unknown as ExpressionSpecification;
  }, [colors, breaks]);

  // Drill-down: the 3 x 3 block (outlines, native counts) and the target's 16 L3 cells (own scale, native counts).
  const blockData = useMemo(() => (drillCell ? blockGeoJSON(drillCell, drillData) : EMPTY_FC), [drillCell, drillData]);
  const l3Data = useMemo(() => l3GeoJSON(drillData), [drillData]);
  const targetData = useMemo(() => (drillCell ? boundsToGeoJSON(cellBounds(drillCell)) : EMPTY_FC), [drillCell]);
  const drillBreaks = drill?.breaks;
  const l3Color = useMemo((): ExpressionSpecification | string => {
    const edges = drillBreaks ?? [];
    const color = (count: number) => colors[`--viz-seq-${drillStep(count, edges)}` as Token];
    if (edges.length === 0) return color(1);
    return ["step", ["get", "count"], color(0), ...edges.flatMap((edge) => [edge, color(edge)])] as unknown as ExpressionSpecification;
  }, [colors, drillBreaks]);
  const labels = useMemo(
    () =>
      blockData.features
        .map((f) => f.properties as DrillCellProps)
        // Once subdivided, the target's counts are its L3 cells: a label on top would hide them.
        .filter((p) => !(p.target && drillData?.subdivided)),
    [blockData, drillData],
  );

  // Entering the drill-down frames the 3 x 3 block and remembers the view; leaving it restores that view.
  // Declared before the area effect, so a new area (which also leaves the drill-down) wins over the restore.
  const savedView = useRef<{ center: [number, number]; zoom: number } | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    setHover(null);
    if (!map) return;
    const duration = prefersReducedMotion() ? 0 : 400;
    if (drillCell) {
      if (!savedView.current) {
        const center = map.getCenter();
        savedView.current = { center: [center.lng, center.lat], zoom: map.getZoom() };
      }
      const b = blockBounds(drillCell);
      map.fitBounds(
        [
          [b.west, b.south],
          [b.east, b.north],
        ],
        { padding: 32, duration },
      );
    } else if (savedView.current) {
      map.easeTo({ ...savedView.current, duration });
      savedView.current = null;
    }
  }, [drillCell, mapRef]);

  // Follow the selected area (no animation when the user asked for reduced motion).
  const fitTo = useCallback(
    (b: Bounds) =>
      mapRef.current?.fitBounds(
        [
          [b.west, b.south],
          [b.east, b.north],
        ],
        { padding: 24, duration: prefersReducedMotion() ? 0 : 400 },
      ),
    [mapRef],
  );
  useEffect(() => {
    fitTo(area);
  }, [area, fitTo]);

  // Globe: open on the whole globe, turned to the study area, instead of the box filling the view. Back to Flat:
  // frame the selected area again, as on load. Not on mount (the map opens Flat, fitted to the area).
  const previousProjection = useRef(projection);
  useEffect(() => {
    if (previousProjection.current === projection) return;
    previousProjection.current = projection;
    const map = mapRef.current;
    if (!map || drillCell) return;
    if (projection === "globe") {
      const canvas = map.getCanvas();
      map.easeTo({
        center: [STUDY_LON, STUDY_LAT],
        zoom: globeZoomToFit(canvas.clientWidth, canvas.clientHeight),
        duration: prefersReducedMotion() ? 0 : 600,
      });
    } else {
      fitTo(area);
    }
    // Only a change of projection moves the view here; the area has its own effect (hence the short deps).
  }, [projection]);

  const hoverAt = (event: MapLayerMouseEvent): Hover | null => {
    const feature = event.features?.[0];
    if (!feature) return null;
    const p = feature.properties as Record<string, unknown>;
    const at = { lng: event.lngLat.lng, lat: event.lngLat.lat };
    switch (feature.layer.id) {
      case "drill-l3-hit":
        return { ...at, kind: "l3", id: String(p.id), count: Number(p.count) };
      case "drill-block-hit":
        return { ...at, kind: "block", id: String(p.id), count: countOf(p.count), target: isTrue(p.target) };
      default:
        return {
          ...at,
          kind: "l2",
          cell: { id: String(p.id), value: Number(p.value), estimated: isTrue(p.estimated), partial: isTrue(p.partial) },
        };
    }
  };

  const onMouseMove = (event: MapLayerMouseEvent) => {
    setHover(hoverAt(event));
    if (finePointer) setPointer(focusCellAt(event.lngLat.lng, event.lngLat.lat, PILOT_BOUNDS, drillCell));
  };
  const onCameraMove = (event: ViewStateChangeEvent) =>
    updateFocus(event.viewState.longitude, event.viewState.latitude, event.viewState.zoom);
  // The popup is not shown for the cell the chip already describes.
  const hoverId = hover ? (hover.kind === "l2" ? hover.cell.id : hover.id) : null;
  const popup = hover && hoverId !== focusId ? hover : null;

  // A click on an L2 cell, or on a neighbor in the drill-down, subdivides it. A click on an L3 cell (the deepest
  // level) or on the target shows its popup, which is how a touch screen reads a cell.
  const onClick = (event: MapLayerMouseEvent) => {
    // Seen from afar on the globe a cell is a few pixels: a click on the study area flies into it.
    const zoom = mapRef.current?.getZoom() ?? 0;
    if (projection === "globe" && !drill && zoom < GLOBE_FLY_IN_BELOW_ZOOM) {
      if (insideBounds(event.lngLat.lng, event.lngLat.lat, PILOT_BOUNDS)) fitTo(area);
      return;
    }
    const next = hoverAt(event);
    if (next?.kind === "l2") onDrill(next.cell.id);
    else if (next?.kind === "block" && !next.target) onDrill(next.id);
    else setHover(next);
  };

  const source = drillData ? `${satelliteName(drillData.satellite)} ${drillData.instrument}` : "native";

  const month = monthLabel ? ` · ${monthLabel}` : "";
  const l2Chip = (id: string) => {
    const cell = cellById.get(id);
    if (!cell || cell.value <= 0) {
      return (
        <>
          Cell {id}: no hotspot detection{month}
          <br />
          <span className="map-popup-hint">No detection does not mean no fire.</span>
        </>
      );
    }
    return (
      <>
        Cell {id}: <strong>{formatCount(cell.value)}</strong> {countLabel}{month}
        {cell.estimated && " · Estimated from MODIS"}
        {cell.partial && " · Partial month"}
        <br />
        <span className="map-popup-hint">
          {!finePointer ? "Tap it" : pointer !== undefined ? "Click" : "Click it or press Enter"} for its 16 sub-cells
          (native detections)
        </span>
      </>
    );
  };
  const l3Chip = (id: string) => {
    const count = l3Counts.get(id) ?? 0;
    return (
      <>
        Sub-cell {id}: {count > 0 ? <strong>{nativeDetections(count)}</strong> : "no native detection"}
        {month}
        <br />
        <span className="map-popup-hint">
          {count > 0 ? `0.0625° sub-cell · ${source}, not harmonized` : "No detection does not mean no fire."}
        </span>
      </>
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
        minZoom={projection === "globe" ? 0 : 3}
        maxZoom={MAX_ZOOM}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        pixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
        fadeDuration={0}
        attributionControl={{ compact: true }}
        interactiveLayerIds={drill ? DRILL_LAYERS : L2_LAYERS}
        onMouseMove={onMouseMove}
        onMove={onCameraMove}
        onClick={onClick}
        onMouseLeave={() => setHover(null)}
        onMouseOut={() => setPointer(undefined)}
        onLoad={(event) => {
          event.target.touchZoomRotate.disableRotation();
          event.target.keyboard.disableRotation();
          const center = event.target.getCenter();
          updateFocus(center.lng, center.lat, event.target.getZoom());
          // On a phone the open attribution covers the bottom of the map: start it folded (still one tap away).
          const container = event.target.getContainer();
          if (container.clientWidth < NARROW_MAP_PX) {
            const attribution = container.querySelector(".maplibregl-ctrl-attrib");
            attribution?.classList.remove("maplibregl-compact-show");
            attribution?.removeAttribute("open");
          }
        }}
        cursor={hover ? "pointer" : "grab"}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <Source id="cells" type="geojson" data={cellData}>
          {/* No stroke around cells: an estimated month is flagged once (badge), not on thousands of cells. */}
          {/* Hidden in the drill-down: the harmonized layer is never shown next to the native L3 cells, or as them. */}
          {/* Under the basemap labels, so place names stay readable; translucent when zoomed in (FILL_FADE). */}
          <Layer
            id="cells-fill"
            type="fill"
            beforeId={beforeId}
            layout={{ visibility: drill ? "none" : "visible" }}
            paint={{ "fill-color": fillColor, "fill-opacity": cellOpacity }}
          />
        </Source>
        <Source id="area-cells" type="geojson" data={areaCellData}>
          <Layer
            id="area-cells-line"
            type="line"
            beforeId={beforeId}
            layout={{ visibility: drill ? "none" : "visible" }}
            // Fades in with zoom: at the zoom that frames the whole area 4,000 outlines are a mesh that hides the
            // colors; once a cell is ~16-32 px wide each outline reads, and shows which cells the area is made of.
            paint={{ "line-color": colors["--viz-selection"], "line-width": 0.5, "line-opacity": GRID_OPACITY }}
          />
        </Source>
        <Source id="area" type="geojson" data={areaData}>
          {/* Hidden in the drill-down too: the same ink outline marks the drilled cell there. The ink outlines (area,
              study area, drilled cell, focus) stay above the labels: they are thin and must never be hidden. */}
          <Layer
            id="area-line"
            type="line"
            layout={{ visibility: drill ? "none" : "visible" }}
            paint={{ "line-color": colors["--viz-selection"], "line-width": 2 }}
          />
        </Source>
        {/* Globe: the study area, the only place with data, dashed and labeled. Outside it nothing is drawn. */}
        <Source id="study" type="geojson" data={STUDY_DATA}>
          <Layer
            id="study-line"
            type="line"
            layout={{ visibility: projection === "globe" && !drill ? "visible" : "none" }}
            paint={{ "line-color": colors["--viz-selection"], "line-width": 1.5, "line-dasharray": [2, 2] }}
          />
        </Source>
        {projection === "globe" && !drill && (
          <Marker longitude={STUDY_LON} latitude={PILOT_BOUNDS.north} anchor="bottom" offset={[0, -6]}>
            <button type="button" className="map-study-label" onClick={() => fitTo(area)}>
              Study area: Northeast Brazil
              <span className="map-study-label-note">data processed only here · go there</span>
            </button>
          </Marker>
        )}
        {/* Drill-down, native detections only. Always mounted (empty outside it), so the layers the pointer reads exist. */}
        <Source id="drill-block" type="geojson" data={blockData}>
          <Layer
            id="drill-block-hit"
            type="fill"
            beforeId={beforeId}
            paint={{ "fill-color": colors["--color-surface"], "fill-opacity": 0 }}
          />
          <Layer
            id="drill-block-line"
            type="line"
            beforeId={beforeId}
            filter={["!", ["get", "target"]]}
            paint={{ "line-color": colors["--color-text-secondary"], "line-width": 1, "line-dasharray": [3, 2] }}
          />
        </Source>
        <Source id="drill-l3" type="geojson" data={l3Data}>
          <Layer
            id="drill-l3-fill"
            type="fill"
            beforeId={beforeId}
            filter={[">", ["get", "count"], 0]}
            paint={{ "fill-color": l3Color, "fill-opacity": l3Opacity }}
          />
          <Layer
            id="drill-l3-hit"
            type="fill"
            beforeId={beforeId}
            paint={{ "fill-color": colors["--color-surface"], "fill-opacity": 0 }}
          />
          <Layer
            id="drill-l3-line"
            type="line"
            beforeId={beforeId}
            paint={{ "line-color": colors["--viz-cell-outline"], "line-width": 0.5 }}
          />
        </Source>
        <Source id="drill-target" type="geojson" data={targetData}>
          <Layer id="drill-target-line" type="line" paint={{ "line-color": colors["--viz-selection"], "line-width": 2 }} />
        </Source>
        {/* The focused cell: an ink outline on a surface halo, so it reads on any cell color and on the basemap. An
            outline only: a cell with no detection is outlined, never filled. */}
        <Source id="focus" type="geojson" data={focusData}>
          <Layer
            id="focus-halo"
            type="line"
            paint={{ "line-color": colors["--color-surface"], "line-width": 5, "line-opacity": 0.85 }}
          />
          <Layer id="focus-line" type="line" paint={{ "line-color": colors["--viz-selection"], "line-width": 2.5 }} />
        </Source>
        {drill &&
          !drill.failed &&
          labels.map((p) => {
            const b = cellBounds(p.id);
            return (
              <Marker
                key={p.id}
                longitude={(b.west + b.east) / 2}
                latitude={(b.south + b.north) / 2}
                anchor="center"
                style={{ pointerEvents: "none" }}
              >
                <span className="map-cell-label" aria-hidden="true">
                  {p.count == null ? "…" : formatCount(p.count)}
                </span>
              </Marker>
            );
          })}
        {popup && (
          <Popup
            longitude={popup.lng}
            latitude={popup.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            offset={10}
            className="map-popup"
          >
            {popup.kind === "l2" && (
              <>
                <strong>{formatCount(popup.cell.value)}</strong> {countLabel}
                <br />
                Cell {popup.cell.id}
                {popup.cell.estimated && " · Estimated from MODIS"}
                {popup.cell.partial && " · Partial month"}
                <br />
                <span className="map-popup-hint">Click to see its 16 sub-cells (native detections)</span>
              </>
            )}
            {popup.kind === "l3" && (
              <>
                {popup.count > 0 ? <strong>{nativeDetections(popup.count)}</strong> : "No native detection"} · Cell{" "}
                {popup.id}
                <br />
                <span className="map-popup-hint">
                  {popup.count > 0
                    ? `0.0625° sub-cell · ${source}, not harmonized`
                    : "No detection does not mean no fire"}
                </span>
              </>
            )}
            {popup.kind === "block" && (
              <>
                {popup.count == null ? "Loading…" : <strong>{nativeDetections(popup.count)}</strong>} · Cell {popup.id}
                <br />
                <span className="map-popup-hint">
                  {popup.target
                    ? `0.25° cell, not subdivided · ${source}, not harmonized`
                    : `Neighboring 0.25° cell · ${source}, not harmonized · click to subdivide it`}
                </span>
              </>
            )}
          </Popup>
        )}
      </Map>
      <div className="map-overlay">
        {/* Always mounted, so a screen reader hears the new cell when the focus moves (polite). */}
        <div className="map-focus-chip" aria-live="polite">
          {focusId && (drillCell ? l3Chip(focusId) : l2Chip(focusId))}
        </div>
        {offline && <p className="map-note map-offline">Basemap unavailable: showing the cells only.</p>}
      </div>
    </div>
  );
}
