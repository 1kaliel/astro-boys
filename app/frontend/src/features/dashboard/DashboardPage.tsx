import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useApiStatus } from "../../data/useApiStatus";
import { useCalendarDataset } from "../../data/useCalendar";
import { cx } from "../../lib/cx";
import { useMediaQuery } from "../../lib/hooks";
import { useDashboard, type Period } from "../../state/dashboard";
import { BurningCalendar, CALENDAR_UNIT } from "../calendar/BurningCalendar";
import { AppBar } from "./AppBar";
import { FilterBar } from "./FilterBar";
import { KpiRow } from "./KpiRow";

// The map (MapLibre, ~300 KB gzip) is a separate chunk: phones download it only when they open the map.
const MapPanel = lazy(() => import("../../components/map/MapPanel"));

const NARROW = "(max-width: 56rem)";
const PERIOD_TEXT: Record<Period, string> = { ALL: "day and night", D: "day", N: "night" };

/** Dashboard layout: app bar, one filter row, KPI row, calendar + map. */
export function DashboardPage() {
  const [state] = useDashboard();
  const narrow = useMediaQuery(NARROW);
  const [mapOpen, setMapOpen] = useState(false);
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
  const showMap = !narrow || mapOpen;

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
          />
        )}

        <Card
          className="dash-calendar"
          title="Burning calendar"
          actions={
            <span className="card-meta">
              {state.startYear}–{state.endYear} · {PERIOD_TEXT[state.period]}
            </span>
          }
          caption={`Source: NASA FIRMS · ${CALENDAR_UNIT}, summed over the 0.25° cells of the selected area`}
        >
          <BurningCalendar load={load} reload={reload} />
        </Card>

        <Card
          className="dash-map"
          title="Map"
          caption="Source: NASA FIRMS · VIIRS-equivalent hotspots per 0.25° cell · basemap © OpenStreetMap contributors"
        >
          {showMap ? (
            <Suspense
              fallback={
                <div className="map-stage">
                  <div className="map-canvas map-loading">Loading map…</div>
                </div>
              }
            >
              <MapPanel />
            </Suspense>
          ) : (
            <div className="map-collapsed">
              <p>The map shows the 0.25° cells of the selected month and lets you draw the area.</p>
              <Button onClick={() => setMapOpen(true)}>Show map</Button>
            </div>
          )}
        </Card>
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
