import type { DashboardAction, DashboardState, Sensor } from "../state/dashboard";

/**
 * The data series, ONE choice shared by the map (primary control) and the sidebar step "What": the harmonized
 * VIIRS-equivalent counts, or the native counts of one instrument family. It is stored as two pieces of state (the
 * calendar scale and the map layer), so every control changes both together through `dataSeriesActions`.
 */
export type DataSeries = "harmonized" | "modis" | "viirs";

export const DATA_SERIES: readonly DataSeries[] = ["harmonized", "modis", "viirs"];

/** Same labels everywhere: `long` where there is room, `short` in segmented controls. */
export const DATA_SERIES_LABEL: Record<DataSeries, { long: string; short: string }> = {
  harmonized: { long: "Harmonized (VIIRS-equivalent)", short: "Harmonized" },
  modis: { long: "MODIS", short: "MODIS" },
  viirs: { long: "VIIRS", short: "VIIRS" },
};

/** One-line explanation of each series. */
export const DATA_SERIES_HINT: Record<DataSeries, string> = {
  harmonized: "VIIRS-equivalent counts, comparable from 2002 to today.",
  modis: "Native MODIS detections (1 km), one satellite at a time: not comparable with VIIRS counts.",
  viirs: "Native VIIRS detections (375 m), one satellite at a time: not comparable with MODIS counts.",
};

export const familyOf = (sensor: Sensor): DataSeries =>
  sensor === "harmonized" ? "harmonized" : sensor === "aqua" || sensor === "terra" ? "modis" : "viirs";

/**
 * The series the state shows. The controls always set scale and layer together, so they agree; should they ever
 * disagree (defensive fallback), the map layer wins: that is what the primary control shows.
 */
export function dataSeriesOf(state: Pick<DashboardState, "scale" | "sensor">): DataSeries {
  return familyOf(state.sensor);
}

/** True when scale and layer disagree (never from the UI; kept so a stray state is visible, not silent). */
export function isMixed(state: Pick<DashboardState, "scale" | "sensor">): boolean {
  const family = familyOf(state.sensor);
  return family === "harmonized" ? state.scale !== "harmonized" : state.scale !== "raw";
}

/**
 * The combined update for a series: Harmonized → scale harmonized + layer harmonized; MODIS → scale raw + Aqua;
 * VIIRS → scale raw + S-NPP. A satellite of the same family already on the map is kept (Terra stays Terra).
 */
export function dataSeriesActions(series: DataSeries, current: Sensor): DashboardAction[] {
  if (series === "harmonized") return [{ type: "setScale", scale: "harmonized" }, { type: "setSensor", sensor: "harmonized" }];
  const sensor: Sensor = familyOf(current) === series ? current : series === "modis" ? "aqua" : "snpp";
  return [{ type: "setScale", scale: "raw" }, { type: "setSensor", sensor }];
}

/** The combined update for one satellite of the native series (scale raw + that layer). */
export function satelliteActions(sensor: Sensor): DashboardAction[] {
  if (sensor === "harmonized") return dataSeriesActions("harmonized", sensor);
  return [{ type: "setScale", scale: "raw" }, { type: "setSensor", sensor }];
}
