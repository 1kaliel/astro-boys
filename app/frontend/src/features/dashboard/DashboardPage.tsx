import { Tabs } from "@base-ui/react/tabs";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "../../components/ui/Badge";
import { useApiStatus } from "../../data/useApiStatus";
import { useCalendarDataset } from "../../data/useCalendar";
import { cx } from "../../lib/cx";
import { useMediaQuery } from "../../lib/hooks";
import { useDashboard, type Period } from "../../state/dashboard";
import { BurningCalendar, CALENDAR_UNIT } from "../calendar/BurningCalendar";
import { monthLong } from "../calendar/calendarText";
import { MonthView } from "../calendar/MonthView";
import { SEASONAL_UNIT, SeasonalProfile } from "../charts/SeasonalProfile";
import { TREND_UNIT, TrendChart } from "../charts/TrendChart";
import { AppBar } from "./AppBar";
import { DownloadCsv } from "./DownloadCsv";
import { currentMonth, LookingAt, monthEntry, MonthStepper, ThisMonth } from "./ExplorerParts";
import { FilterBar } from "./FilterBar";
import { KpiRow } from "./KpiRow";
import "../../styles/redesign-layout.css";
import "../../styles/explorer.css";

// The map (MapLibre, ~300 KB gzip) is a separate chunk, loaded after the first paint.
const MapPanel = lazy(() => import("../../components/map/MapPanel"));

/** Below 64rem the explorer stacks: steps, map, then one panel at a time. */
const NARROW = "(max-width: 63.99rem)";
const PERIOD_TEXT: Record<Period, string> = { ALL: "day and night", D: "day", N: "night" };

/** Bottom panel on wide screens; on phones "Days" joins it (the sidebar is not there). */
type PanelTab = "timeline" | "days" | "trend" | "season";

/**
 * Map-first explorer. Wide: app bar; a sidebar (what you are looking at, the three steps Where / When / What, the
 * month in numbers, its days, the period figures, Download); the map fills the rest; a bottom panel with the timeline
 * (years x months) and the charts, collapsible. One selected month drives everything: the latest month by default.
 * Narrow: the same parts stacked, the map at 60% of the screen, then Timeline / Days / Charts tabs.
 */
export function DashboardPage() {
  const [state, dispatch] = useDashboard();
  const narrow = useMediaQuery(NARROW);
  const [tab, setTab] = useState<PanelTab>("timeline");
  const [panelOpen, setPanelOpen] = useState(true);
  const apiStatus = useApiStatus();
  // One request for the area, shared by the numbers, the timeline and the charts.
  const [load, reload] = useCalendarDataset(state.area, state.period);

  // When the API comes back (e.g. the backend started after the page), reload what failed.
  const previousApi = useRef(apiStatus);
  useEffect(() => {
    if (previousApi.current !== "ok" && apiStatus === "ok" && load.status === "error") reload();
    previousApi.current = apiStatus;
  }, [apiStatus, load.status, reload]);

  const dataset = load.status === "ready" ? load.dataset : null;
  const refreshing = load.status === "ready" && load.refreshing;
  const simulated = dataset ? dataset.synthetic || /^mock/i.test(dataset.modelVersion) : false;
  const exportContext = dataset ? { area: state.area, modelVersion: dataset.modelVersion, period: state.period } : null;

  // The one month of the explorer: picked, else the latest month of the data. It is written to the state once the
  // data is there, so the map, the days and the timeline all read the same month.
  const month = currentMonth(state.selected, dataset);
  useEffect(() => {
    if (!state.selected && month) dispatch({ type: "select", year: month.year, month: month.month });
  }, [state.selected, month, dispatch]);
  const entry = monthEntry(dataset, month, state.period);
  const profileYear = dataset ? Math.min(month?.year ?? dataset.lastYear, dataset.lastYear) : null;
  const pickMonth = (year: number, m: number) => dispatch({ type: "openMonth", year, month: m });

  const years = `${state.startYear}–${state.endYear} · ${PERIOD_TEXT[state.period]}`;

  const kpis = dataset && (
    <section className="xp-section" aria-label="The period in figures">
      <h2 className="xp-section-title">
        The period, {state.startYear}–{state.endYear}
      </h2>
      <KpiRow
        months={dataset.months}
        startYear={state.startYear}
        endYear={state.endYear}
        baselineYears={dataset.baselineYears}
        area={state.area}
        period={dataset.period ?? state.period}
        modelVersion={dataset.modelVersion}
        onPickMonth={pickMonth}
      />
    </section>
  );

  // The days wait for the month to be in the state (MonthView reads it there).
  const days =
    dataset && month && state.selected ? (
      <section className="xp-section xp-days calendar-theme" aria-label={`Days of ${monthLong(month.month)} ${month.year}`}>
        <h2 className="xp-section-title">
          Days of {monthLong(month.month)} {month.year}
        </h2>
        <MonthView dataset={dataset} compact />
      </section>
    ) : null;

  const status =
    load.status === "loading" ? (
      <p className="calendar-status" role="status">
        Loading the data…
      </p>
    ) : null;

  const timeline = (
    <div className="xp-panel-body calendar-theme" data-tour="calendar">
      <BurningCalendar load={load} reload={reload} />
      <p className="card-caption">Source: NASA FIRMS · {CALENDAR_UNIT}. Click a month to show it on the map.</p>
    </div>
  );
  const season =
    dataset && exportContext && profileYear !== null ? (
      <div className="xp-panel-body dash-charts">
        <SeasonalProfile
          months={dataset.months}
          startYear={state.startYear}
          endYear={state.endYear}
          year={profileYear}
          exportContext={exportContext}
        />
        <p className="card-caption">Source: NASA FIRMS · {SEASONAL_UNIT}</p>
      </div>
    ) : (
      status
    );
  const trend =
    dataset && exportContext ? (
      <div className="xp-panel-body dash-charts">
        <TrendChart months={dataset.months} startYear={state.startYear} endYear={state.endYear} exportContext={exportContext} />
        <p className="card-caption">Source: NASA FIRMS · {TREND_UNIT}</p>
      </div>
    ) : (
      status
    );

  const map = (
    <section className="xp-map" data-tour="map" aria-label="Map">
      <Suspense
        fallback={
          <div className="map-panel">
            <div className="map-stage">
              <div className="map-canvas map-loading">Loading map…</div>
            </div>
          </div>
        }
      >
        <MapPanel />
      </Suspense>
    </section>
  );

  const banner = simulated && (
    <div className="banner" role="note">
      <Badge kind="simulated" />
      <span>
        Simulated numbers for building the app. They are not satellite observations and not a result, and must never
        appear in a figure or the demo.
      </span>
    </div>
  );

  const tabs: ReadonlyArray<{ value: PanelTab; label: string; body: ReactNode; tour?: string }> = narrow
    ? [
        { value: "timeline", label: "Timeline", body: timeline },
        { value: "days", label: "Days", body: <div className="xp-panel-body">{days ?? status}</div> },
        {
          value: "trend",
          label: "Charts",
          tour: "charts",
          body: (
            <>
              {trend}
              {season}
            </>
          ),
        },
      ]
    : [
        { value: "timeline", label: "Timeline", body: timeline },
        { value: "trend", label: "Raw vs harmonized", body: trend, tour: "charts" },
        { value: "season", label: "Seasonal profile", body: season },
      ];
  const activeTab = tabs.some((t) => t.value === tab) ? tab : "timeline";

  const panel = (
    <section className={cx("xp-panel", !panelOpen && "is-collapsed")} aria-label="Timeline and charts">
      <Tabs.Root value={activeTab} onValueChange={(value) => setTab(value as PanelTab)}>
        <div className="xp-panel-head">
          <Tabs.List className="card-tabs" aria-label="Panel">
            {tabs.map((t) => (
              <Tabs.Tab
                key={t.value}
                value={t.value}
                className="card-tab"
                data-tour={t.tour}
                onClick={() => setPanelOpen(true)}
              >
                {t.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <span className="card-meta">{years}</span>
          {!narrow && (
            <button
              type="button"
              className="button xp-collapse"
              aria-expanded={panelOpen}
              onClick={() => setPanelOpen((open) => !open)}
            >
              {panelOpen ? "Hide panel ▾" : "Show panel ▴"}
            </button>
          )}
        </div>
        {panelOpen &&
          tabs.map((t) => (
            <Tabs.Panel key={t.value} value={t.value} className="xp-panel-scroll">
              {t.body}
            </Tabs.Panel>
          ))}
      </Tabs.Root>
    </section>
  );

  const footer = (
    <footer className="xp-footer">
      <div className="xp-download">
        <DownloadCsv />
      </div>
      <p>
        <strong>What this shows:</strong> hotspots are satellite thermal detections. They are not confirmed fires and
        not burned area. Months before February 2012 are estimated from MODIS.
      </p>
      <p>
        Data: NASA FIRMS (MODIS and VIIRS active fire products). This prototype is exploratory and must not be used for
        emergency or resource decisions.
      </p>
    </footer>
  );

  const steps = (
    <FilterBar collapsible={narrow} when={narrow ? undefined : <MonthStepper month={month} dataset={dataset} />} />
  );

  return (
    <div className={cx("app", "xp-app", narrow ? "is-narrow" : "is-wide")}>
      <AppBar apiStatus={apiStatus} simulated={simulated} modelVersion={dataset?.modelVersion ?? null} />

      {narrow ? (
        <main className={cx("xp-stack", refreshing && "is-refetching")} aria-busy={load.status === "loading" || refreshing}>
          {banner}
          <LookingAt month={month} entry={entry} />
          <MonthStepper month={month} dataset={dataset} />
          {steps}
          {map}
          <ThisMonth month={month} entry={entry} />
          {panel}
          {kpis}
          {footer}
        </main>
      ) : (
        <main className={cx("xp", refreshing && "is-refetching", !panelOpen && "panel-collapsed")} aria-busy={load.status === "loading" || refreshing}>
          <aside className="xp-side" aria-label="Explorer controls">
            {banner}
            <LookingAt month={month} entry={entry} />
            {steps}
            <ThisMonth month={month} entry={entry} />
            {days}
            {kpis}
            {footer}
          </aside>
          {map}
          {panel}
        </main>
      )}

    </div>
  );
}
