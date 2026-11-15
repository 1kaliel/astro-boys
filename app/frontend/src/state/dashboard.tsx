import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";

/** Day, night or both, as in the data contract (`period` column). */
export type Period = "ALL" | "D" | "N";
export type Scale = "harmonized" | "raw";
/** What the calendar colors show: the count of each month, or how unusual it is for that month of the year. */
/**
 * Layer of the map. "harmonized" is the VIIRS-equivalent count of the calendar (MODIS months estimated on the VIIRS
 * scale); the others are native counts of one satellite (MODIS: Aqua, Terra; VIIRS: S-NPP, NOAA-20), never added.
 */
export type Sensor = "harmonized" | "aqua" | "terra" | "snpp" | "n20";
/** Minimum fire radiative power (MW) of a native detection; 0 = no minimum. Intensity filter. */
export type MinFrp = 0 | 10 | 50 | 100;
/** Lowest confidence class of a native detection (l < n < h). Relevance filter. */
export type Relevance = "l" | "n" | "h";
export type Metric = "count" | "anomaly";
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
  /** Intensity and relevance act on native detections only (drill-down, CSV): the harmonized calendar has neither. */
  minFrp: MinFrp;
  relevance: Relevance;
  /** Layer of the map (and of its drill-down). */
  sensor: Sensor;
  startYear: number;
  endYear: number;
  /** Months of the year shown (1..12). Empty means every month. */
  months: readonly number[];
  /** Month picked in the calendar; drives the map. */
  selected: { year: number; month: number } | null;
  /**
   * L2 cell the map is drilled into (task D11): its 16 L3 sub-cells of native detections. Null = the harmonized L2
   * map. Cleared whenever the month, the period or the area changes, so it never shows another slice.
   */
  drillCell: string | null;
};

export type DashboardAction =
  | { type: "setArea"; area: Bounds }
  | { type: "setPeriod"; period: Period }
  | { type: "setScale"; scale: Scale }
  | { type: "setMetric"; metric: Metric }
  | { type: "setSensor"; sensor: Sensor }
  | { type: "setMinFrp"; minFrp: MinFrp }
  | { type: "setRelevance"; relevance: Relevance }
  | { type: "setYears"; startYear: number; endYear: number }
  | { type: "setMonths"; months: readonly number[] }
  | { type: "select"; year: number; month: number }
  | { type: "drill"; cell: string }
  | { type: "undrill" };

const initialState: DashboardState = {
  area: PILOT_BOUNDS,
  period: "ALL",
  scale: "harmonized",
  metric: "count",
  minFrp: 0,
  relevance: "l",
  sensor: "harmonized",
  // Opens on the last 10 years: the calendar has one row per year, and 25 rows is a very tall card.
  startYear: LAST_YEAR - 9,
  endYear: LAST_YEAR,
  months: [],
  selected: null,
  drillCell: null,
};

export function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case "setArea": {
      const same = sameBounds(state.area, action.area);
      return { ...state, area: action.area, drillCell: same ? state.drillCell : null };
    }
    case "setPeriod":
      return { ...state, period: action.period, drillCell: action.period === state.period ? state.drillCell : null };
    case "setScale":
      return { ...state, scale: action.scale };
    case "setSensor":
      return { ...state, sensor: action.sensor, drillCell: action.sensor === state.sensor ? state.drillCell : null };
    case "setMinFrp":
      return { ...state, minFrp: action.minFrp, drillCell: action.minFrp === state.minFrp ? state.drillCell : null };
    case "setRelevance":
      return {
        ...state,
        relevance: action.relevance,
        drillCell: action.relevance === state.relevance ? state.drillCell : null,
      };
    case "setMetric":
      return { ...state, metric: action.metric };
    case "setYears": {
      // Keep the range ordered whichever end the user moved.
      const startYear = Math.min(action.startYear, action.endYear);
      const endYear = Math.max(action.startYear, action.endYear);
      return { ...state, startYear, endYear };
    }
    case "setMonths": {
      // Keep 1..12, sorted and unique. All twelve is the same as no filter.
      const months = [...new Set(action.months)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
      return { ...state, months: months.length === 12 ? [] : months };
    }
    case "select": {
      const same = state.selected?.year === action.year && state.selected.month === action.month;
      return { ...state, selected: { year: action.year, month: action.month }, drillCell: same ? state.drillCell : null };
    }
    case "drill":
      return { ...state, drillCell: action.cell };
    case "undrill":
      return { ...state, drillCell: null };
  }
}

function sameBounds(a: Bounds, b: Bounds): boolean {
  return a.west === b.west && a.south === b.south && a.east === b.east && a.north === b.north;
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
