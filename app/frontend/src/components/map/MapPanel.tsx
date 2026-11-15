import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { cellsUrl, useRemote, type CellsResponse } from "../../data/api";
import { MONTHS_LONG } from "../../lib/format";
import { cellIdAt } from "../../lib/grid";
import { drillBreaks, sequentialEdges } from "../../lib/scale";
import { useDashboard } from "../../state/dashboard";
import { Badge } from "../ui/Badge";
import { Fold } from "../ui/Fold";
import { Button } from "../ui/Button";
import { Legend } from "../viz/Legend";
import { CellMap, type DrillView } from "./CellMap";
import { DrillLegend } from "./DrillLegend";
import { useDrilldown } from "./drill";
import { MapLayerControl, layerCountLabel, layerUnit } from "./MapLayerControl";
import { MapTools, type Projection } from "./MapTools";
import { CoordinateSearch, type PickedPoint } from "./CoordinateSearch";

const EMPTY: CellsResponse["cells"] = [];

/**
 * Map panel (task D3). Loaded on demand (React.lazy), so phones only download MapLibre when they open the map.
 * Shows the month selected in the calendar (the latest month until one is picked), harmonized scale. A click on a
 * cell opens the L3 drill-down (task D11): native detections of its 16 sub-cells, with its 8 neighbors.
 */
export default function MapPanel() {
  const [state, dispatch] = useDashboard();
  const mapRef = useRef<MapRef | null>(null);
  const [projection, setProjection] = useState<Projection>("mercator");
  const [drawing, setDrawing] = useState(false);
  // Coordinate search: "Pick on map" turns the next map click into a point instead of a drill-down.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<PickedPoint | null>(null);
  const onDrawing = useCallback((next: boolean) => {
    setDrawing(next);
    if (next) setPicking(false);
  }, []);
  const onPick = useCallback((lat: number, lon: number) => {
    setPicked({ lat, lon, at: Date.now() });
    setPicking(false);
  }, []);
  const remote = useRemote<CellsResponse>(cellsUrl(state.period, state.selected, state.sensor));

  const data = remote.data;
  const cells = data?.cells ?? EMPTY;
  // Fixed breaks from the API keep months comparable. The per-month fallback only serves an older backend
  // that sends no breaks; without data there are no breaks (and no legend) at all.
  const breaks = useMemo(
    () => (data ? (data.breaks ?? sequentialEdges(data.cells.map((cell) => cell.value)).edges) : []),
    [data],
  );
  const estimated = cells.some((cell) => cell.estimated);
  const partial = cells.some((cell) => cell.partial);
  const monthLabel = data ? `${MONTHS_LONG[data.month - 1]} ${data.year}` : null;
  const mapMonth = useMemo(
    () => (data && monthLabel ? { year: data.year, month: data.month, label: monthLabel } : null),
    [data, monthLabel],
  );

  // The drill-down asks for the month on the map (the latest month when none is picked yet).
  const drillCell = state.drillCell;
  const drillRequest = useMemo(
    () => (drillCell && data ? { cell: drillCell, year: data.year, month: data.month, period: state.period, minFrp: state.minFrp, relevance: state.relevance, sensor: state.sensor } : null),
    [drillCell, data, state.period, state.minFrp, state.relevance, state.sensor],
  );
  const { load: drillLoad, retry: retryDrill } = useDrilldown(drillRequest);
  const drillData = drillLoad?.status === "ready" && drillLoad.data.cell === drillCell ? drillLoad.data : null;
  const l3Breaks = useMemo(() => (drillData ? drillBreaks(drillData.l3.map((c) => c.count)) : []), [drillData]);
  const drill = useMemo(
    (): DrillView | null =>
      drillCell ? { cell: drillCell, data: drillData, breaks: l3Breaks, failed: drillLoad?.status === "error" } : null,
    [drillCell, drillData, l3Breaks, drillLoad?.status],
  );

  const onDrill = useCallback(
    (cell: string) => {
      if (!drawing && !picking) dispatch({ type: "drill", cell });
    },
    [dispatch, drawing, picking],
  );
  const leaveDrill = useCallback(() => {
    dispatch({ type: "undrill" });
    // The Back button disappears with the drill-down: keep the keyboard on the map.
    mapRef.current?.getCanvas().focus();
  }, [dispatch]);

  // Escape leaves the drill-down; Enter on the focused map opens the drill-down of the cell at its center, so the
  // keyboard reaches it too (the arrow keys pan the map).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && picking) {
      event.preventDefault();
      setPicking(false);
    } else if (event.key === "Escape" && drillCell) {
      event.preventDefault();
      leaveDrill();
    } else if (event.key === "Enter" && !drawing && !picking && event.target === mapRef.current?.getCanvas()) {
      const center = mapRef.current.getCenter();
      const id = cellIdAt(center.lat, center.lng);
      if (drillCell || cells.some((cell) => cell.id === id && cell.value > 0)) {
        event.preventDefault();
        dispatch({ type: "drill", cell: id });
      }
    }
  };

  return (
    <div className="map-panel" onKeyDown={onKeyDown}>
      <header className="card-header map-head">
        <h2 className="card-title">
          Map <span className="card-meta">{monthLabel ?? "Loading…"}{remote.loading && data ? " · updating…" : ""}</span>
        </h2>
        <MapLayerControl sensor={state.sensor} onSensor={(sensor) => dispatch({ type: "setSensor", sensor })} />
      </header>
      {(drillCell || (estimated && !drillCell) || partial) && (
        <div className="map-sub">
          {drillCell && <p className="map-month">Cell {drillCell}: native detections of its 0.0625° sub-cells</p>}
          <div className="map-badges">
            {/* "Estimated" belongs to the harmonized layer, which the drill-down does not show. */}
            {estimated && !drillCell && <Badge kind="estimated" />}
            {partial && <Badge kind="partial" />}
          </div>
        </div>
      )}

      {/* The frame holds the tools and the map: over the map on wide screens, in a row above it on a phone. */}
      <div className="map-frame">
        <MapTools
          mapRef={mapRef}
          projection={projection}
          onProjection={setProjection}
          onArea={(area) => dispatch({ type: "setArea", area })}
          drilled={drillCell !== null}
          onBack={leaveDrill}
          onDrawing={onDrawing}
          coords={
            <CoordinateSearch
              mapRef={mapRef}
              month={mapMonth}
              picking={picking}
              onPicking={setPicking}
              picked={picked}
              drawing={drawing}
            />
          }
        />
        <div className="map-stage">
          <CellMap
            mapRef={mapRef}
            cells={cells}
            breaks={breaks}
            area={state.area}
            projection={projection}
            drill={drill}
            onDrill={onDrill}
            monthLabel={monthLabel}
            countLabel={layerCountLabel(state.sensor)}
            suppressFocus={drawing || picking}
            point={state.point}
            picking={picking}
            onPick={onPick}
          />
        </div>
      </div>

      <div className="map-info">
      {remote.error && (
        <p className="map-note map-error" role="alert">
          Could not load the cells: {remote.error}
        </p>
      )}

      {drillCell ? (
        <>
          <p className="map-note" role="status">
            {drillLoad?.status === "loading" && "Loading the native detections…"}
            {drillData && !drillData.subdivided &&
              `Fewer than ${drillData.min_detections} native detections: not subdivided. The 0.25° cell and its neighbors show their counts.`}
            {drillData?.subdivided && "Hover or tap a sub-cell for its count. Press Escape or use Back to return."}
          </p>
          {drillLoad?.status === "error" && (
            <div className={drillLoad.code === 422 ? "map-note" : "map-note map-error"} role={drillLoad.code === 422 ? "status" : "alert"}>
              {drillLoad.code === 422
                ? `No drill-down for this month: ${drillLoad.message}`
                : drillLoad.code === 503 || drillLoad.code === 0
                  ? "Detections are unavailable right now."
                  : `Could not load the detections: ${drillLoad.message}`}{" "}
              {drillLoad.code !== 422 && <Button onClick={retryDrill}>Retry</Button>}
            </div>
          )}
          {drillData && <DrillLegend data={drillData} breaks={l3Breaks} />}
        </>
      ) : (
        <>
          {projection === "globe" && (
            <p className="map-note">
              Globe: data were processed only inside the study area (dashed box, Northeast Brazil). Outside it nothing is
              drawn, which is not zero activity. Click the box or its label to fly in.
            </p>
          )}
          {data && data.cells.length === 0 && (
            <p className="map-note">
              {state.sensor === "harmonized"
                ? "No hotspot detections in this month. No detection does not mean no fire."
                : "This satellite has no data for this month (it was not flying yet, or it was out of service). Missing data is not zero detections."}
            </p>
          )}
          {data && (
            <>
            <Legend
              mode="sequential"
              breaks={breaks}
              unit={`${layerUnit(state.sensor)} per 0.25° cell and month`}
              showMarking={false}
            />
            <Fold summary="How to read the map">
              <p className="map-note">An empty cell has no detection (not zero). Click a cell for its sub-cells.</p>
              <p className="map-note">
                Classes are the same for every month, so a quiet month looks quiet. Cells with no detection that month are
                left empty and the basemap shows through: that is missing, not zero. Cell outlines appear when you zoom in;
                closer in, the colors turn translucent so the basemap reads through (same classes), and the cell at the
                center, or under the mouse, is outlined and described.
              </p>
            </Fold>
            </>
          )}
        </>
      )}
        <p className="card-caption map-caption">
          {drillCell
            ? "Source: NASA FIRMS · native detections per 0.0625° sub-cell · basemap © OpenStreetMap contributors"
            : "Source: NASA FIRMS · VIIRS-equivalent hotspots per 0.25° cell · basemap © OpenStreetMap contributors"}
        </p>
      </div>
    </div>
  );
}