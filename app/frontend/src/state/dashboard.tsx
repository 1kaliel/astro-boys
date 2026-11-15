import { NO_FILTERS, type CalendarFilters, type DeviationBand } from "../features/calendar/calendarFilters";
import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";

/** Day, night or both, as in the data contract (`period` column). */
export type Period = "ALL" | "D" | "N";
export type Scale = "harmonized" | "raw";
/** What the calendar colors show: the count of each month, or how unusual it is for that month of the year. */
export type Metric = "count" | "anomaly";
export type Palette = "default" | "contrast";
export type Bounds = { west: number; south: number; east: number; north: number };

/** Pilot extent: Northeast Brazil MVP clip (docs/spec/harmonization.md). */
export const PILOT_BOUNDS: Bounds = { west: -48.8, south: -18.4, east: -34.7, north: -1.0 };
// calendar/v1 starts in July 2002 (Aqua); the months before it show as "no data".
export const FIRST_YEAR = 2002;
export const LAST_YEAR = 2026;

export type DashboardState = {
  area: Bounds;
  period: Period;
  scale: Scale;
  metric: Metric;
  startYear: number;
  endYear: number;
  /** Months of the year shown (1..12). Empty means every month. */
  months: readonly number[];
  /** Month picked in the calendar; drives the map. */
  selected: { year: number; month: number } | null;
  /** Calendar filters that mask months without moving them (see features/calendar/calendarFilters.ts). */
  filters: CalendarFilters;
  palette: Palette;
};

export type DashboardAction =
  | { type: "setArea"; area: Bounds }
  | { type: "setPeriod"; period: Period }
  | { type: "setScale"; scale: Scale }
  | { type: "setMetric"; metric: Metric }
  | { type: "setYears"; startYear: number; endYear: number }
  | { type: "setMonths"; months: readonly number[] }
  | { type: "select"; year: number; month: number }
  | { type: "setVolume"; min: number | null; max: number | null }
  | { type: "setDeviation"; bands: readonly DeviationBand[] }
  | { type: "setRange"; startYear: number; endYear: number; range: CalendarFilters["range"] }
  | { type: "setLegend"; steps: readonly number[] }
  | { type: "setPalette"; palette: Palette }
  | { type: "clearFilters" };

const initialState: DashboardState = {
  area: PILOT_BOUNDS,
  period: "ALL",
  scale: "harmonized",
  metric: "count",
  startYear: FIRST_YEAR,
  endYear: LAST_YEAR,
  months: [],
  selected: null,
  filters: NO_FILTERS,
  palette: "default",
};

export function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case "setArea":
      return { ...state, area: action.area };
    case "setPeriod":
      return { ...state, period: action.period };
    case "setScale":
      return { ...state, scale: action.scale, filters: { ...state.filters, legend: [], deviation: [] } };
    case "setMetric":
      // The legend steps mean something else in the other view.
      return { ...state, metric: action.metric, filters: { ...state.filters, legend: [] } };
    case "setYears": {
      // Keep the range ordered whichever end the user moved.
      const startYear = Math.min(action.startYear, action.endYear);
      const endYear = Math.max(action.startYear, action.endYear);
      // Picking the years by hand drops a shortcut window.
      return { ...state, startYear, endYear, filters: { ...state.filters, range: null } };
    }
    case "setMonths": {
      // Keep 1..12, sorted and unique. All twelve is the same as no filter.
      const months = [...new Set(action.months)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
      return { ...state, months: months.length === 12 ? [] : months };
    }
    case "select":
      return { ...state, selected: { year: action.year, month: action.month } };
    case "setVolume": {
      const ok = (v: number | null) => (v !== null && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
      let min = ok(action.min);
      let max = ok(action.max);
      if (min !== null && max !== null && min > max) [min, max] = [max, min];
      return { ...state, filters: { ...state.filters, volumeMin: min, volumeMax: max } };
    }
    case "setDeviation":
      return { ...state, filters: { ...state.filters, deviation: [...new Set(action.bands)] } };
    case "setRange":
      return {
        ...state,
        startYear: action.startYear,
        endYear: action.endYear,
        filters: { ...state.filters, range: action.range },
      };
    case "setLegend":
      return { ...state, filters: { ...state.filters, legend: [...new Set(action.steps)].sort((a, b) => a - b) } };
    case "setPalette":
      return { ...state, palette: action.palette };
    case "clearFilters":
      return { ...state, filters: NO_FILTERS };
  }
}

const StateContext = createContext<DashboardState | null>(null);
const DispatchContext = createContext<Dispatch<DashboardAction> | null>(null);

/** One shared state drives every view (docs/spec/dashboard.md section 2). */
export function DashboardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);
  const value = useMemo(() => state, [state]);
  return (
    <StateContext.Provider value={value}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useDashboard(): [DashboardState, Dispatch<DashboardAction>] {
  const state = useContext(StateContext);
  const dispatch = useContext(DispatchContext);
  if (!state || !dispatch) throw new Error("useDashboard must be used inside <DashboardProvider>");
  return [state, dispatch];
}
