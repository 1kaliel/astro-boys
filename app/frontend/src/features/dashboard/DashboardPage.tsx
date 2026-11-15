import { Tabs } from "@base-ui/react/tabs";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { SegmentedControl, type SegmentOption } from "../../components/ui/SegmentedControl";
import { useApiStatus } from "../../data/useApiStatus";
import { useCalendarDataset } from "../../data/useCalendar";
import { cx } from "../../lib/cx";
import { useMediaQuery } from "../../lib/hooks";
import { useDashboard, type Period } from "../../state/dashboard";
import { BurningCalendar, CALENDAR_UNIT } from "../calendar/BurningCalendar";
import { SEASONAL_UNIT, SeasonalProfile } from "../charts/SeasonalProfile";
import { TREND_UNIT, TrendChart } from "../charts/TrendChart";
import { AppBar } from "./AppBar";
import { FilterBar } from "./FilterBar";
import { KpiRow } from "./KpiRow";
import "../../styles/redesign-layout.css";

// The map (MapLibre, ~300 KB gzip) is a separate chunk: phones download it only when they open the map.
const MapPanel = lazy(() => import("../../components/map/MapPanel"));

const NARROW = "(max-width: 56rem)";
const PERIOD_TEXT: Record<Period, string> = { ALL: "day and night", D: "day", N: "night" };

/** Phones show one view at a time (team proposal, mobile order): the calendar first, then the map or the charts. */
type MobileView = "calendar" | "map" | "charts";
const MOBILE_VIEWS: ReadonlyArray<SegmentOption<MobileView>> = [
  { value: "calendar", label: "Calendar" },
  { value: "map", label: "Map" },
  { value: "charts", label: "Charts" },
];

/** The two analysis charts share one card, one tab each. */
type ChartTab = "season" | "trend";

/**
 * Dashboard layout, in reading order: app bar, one filter row, the three KPIs, the workspace (calendar large on the
 * left, map on the right, same height) and the analysis charts below.
 */
export function DashboardPage() {
  const [state] = useDashboard();
  const narrow = useMediaQuery(NARROW);
  const [mobileView, setMobileView] = useState<MobileView>("calendar");
  const [chartTab, setChartTab] = useState<ChartTab>("season");
  const apiStatus = useApiStatus();
  // One request for the area, shared by the KPI row and the calendar.
  const [load, reload] = useCalendarDataset(state.area, state.period);

  // When the API comes back (e.g. the backend started after the page), reload what failed.
  const previousApi = useRef(apiStatus);
  useEffect(() => {
    if (previousApi.current !== "ok" && apiStatus === "ok" && load.status === "error") reload();
    previousApi.current = apiStatus;
  }, [apiStatus, load.status, reload]);

  const dataset = load.status === "ready" ? load.dataset : null;
  const refreshing = load.status === "ready" && load.refreshing;
  // The mock calendar is labeled by its model version; the offline fixture by its own flag.
  const simulated = dataset ? dataset.synthetic || /^mock/i.test(dataset.modelVersion) : false;
  const exportContext = dataset ? { area: state.area, modelVersion: dataset.modelVersion, period: state.period } : null;
  const showCalendar = !narrow || mobileView === "calendar";
  const showMap = !narrow || mobileView === "map";
  const showCharts = !narrow || mobileView === "charts";
  // The seasonal profile draws the year of the month picked in the calendar, or the latest year of the data.
  const profileYear = dataset ? Math.min(state.selected?.year ?? dataset.lastYear, dataset.lastYear) : null;

  return (
    <div className="app">
      <AppBar apiStatus={apiStatus} simulated={simulated} modelVersion={dataset?.modelVersion ?? null} />
      <FilterBar />

      <main className={cx("dash", refreshing && "is-refetching")} aria-busy={load.status === "loading" || refreshing}>
        {simulated && (
          <div className="banner" role="note">
            <Badge kind="simulated" />
            <span>
              Simulated numbers for building the app. They are not satellite observations and not a result, and must
              never appear in a figure or the demo.
            </span>
          </div>
        )}

        {dataset && (
          <KpiRow
            months={dataset.months}
            startYear={state.startYear}
            endYear={state.endYear}
            baselineYears={dataset.baselineYears}
            area={state.area}
            period={dataset.period ?? state.period}
            modelVersion={dataset.modelVersion}
          />
        )}

        {narrow && (
          <div className="mobile-views" data-tour="views">
            <SegmentedControl label="Show" hideLabel options={MOBILE_VIEWS} value={mobileView} onChange={setMobileView} />
          </div>
        )}

        {showCalendar && (
        <Card
          data-tour="calendar"
          className="dash-calendar calendar-theme"
          title="Burning calendar"
          actions={
            <span className="card-meta">
              {state.startYear}–{state.endYear} · {PERIOD_TEXT[state.period]}
            </span>
          }
          caption={`Source: NASA FIRMS · ${CALENDAR_UNIT}`}
        >
          <BurningCalendar load={load} reload={reload} />
        </Card>
        )}

        {showMap && (
        <Card
          data-tour="map"
          className="dash-map"
          caption={
            state.drillCell
              ? "Source: NASA FIRMS · native detections per 0.0625° sub-cell · basemap © OpenStreetMap contributors"
              : "Source: NASA FIRMS · VIIRS-equivalent hotspots per 0.25° cell · basemap © OpenStreetMap contributors"
          }
        >
          {/* The map panel draws its own header: the month on the map and the layer switch share the title row. */}
          <Suspense
            fallback={
              <div className="map-panel">
                <header className="card-header map-head">
                  <h2 className="card-title">Map</h2>
                </header>
                <div className="map-stage">
                  <div className="map-canvas map-loading">Loading map…</div>
                </div>
              </div>
            }
          >
            <MapPanel />
          </Suspense>
        </Card>
        )}

        {showCharts && dataset && exportContext && profileYear !== null && (
          <Card
            data-tour="charts"
            className="dash-charts"
            caption={`Source: NASA FIRMS · ${chartTab === "season" ? SEASONAL_UNIT : TREND_UNIT}`}
          >
            <Tabs.Root value={chartTab} onValueChange={(value) => setChartTab(value as ChartTab)} className="charts-tabs">
              <header className="card-header">
                <h2 className="sr-only">Charts</h2>
                <Tabs.List className="card-tabs" aria-label="Chart">
                  <Tabs.Tab value="season" className="card-tab">
                    Seasonal profile
                  </Tabs.Tab>
                  <Tabs.Tab value="trend" className="card-tab">
                    Raw vs harmonized
                  </Tabs.Tab>
                </Tabs.List>
                <span className="card-meta">
                  {chartTab === "season" ? `${profileYear} against ` : ""}
                  {state.startYear}–{state.endYear} · {PERIOD_TEXT[state.period]}
                </span>
              </header>
              <Tabs.Panel value="season" className="card-tab-panel">
                <SeasonalProfile
                  months={dataset.months}
                  startYear={state.startYear}
                  endYear={state.endYear}
                  year={profileYear}
                  exportContext={exportContext}
                />
              </Tabs.Panel>
              <Tabs.Panel value="trend" className="card-tab-panel">
                <TrendChart
                  months={dataset.months}
                  startYear={state.startYear}
                  endYear={state.endYear}
                  exportContext={exportContext}
                />
              </Tabs.Panel>
            </Tabs.Root>
          </Card>
        )}
      </main>

      <footer className="app-footer">
        <p>
          <strong>What this shows:</strong> hotspots are satellite thermal detections. They are not confirmed fires and
          not burned area. Months before February 2012 are estimated from MODIS.
        </p>
        <p>
          Data: NASA FIRMS (MODIS and VIIRS active fire products). This prototype is exploratory and must not be used for
          emergency or resource decisions.
        </p>
      </footer>
    </div>
  );
}
