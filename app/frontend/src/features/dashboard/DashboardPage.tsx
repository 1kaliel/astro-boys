import { Card } from "../../components/ui/Card";
import { SegmentedControl, type SegmentOption } from "../../components/ui/SegmentedControl";
import { YearSelect } from "../../components/ui/YearSelect";
import { StatTile } from "../../components/viz/StatTile";
import { useApiStatus } from "../../data/useApiStatus";
import { FIRST_YEAR, LAST_YEAR, useDashboard, type Period, type Scale } from "../../state/dashboard";
import { BurningCalendar } from "../calendar/BurningCalendar";
import { AboutDialog } from "./AboutDialog";

const PERIOD_OPTIONS: ReadonlyArray<SegmentOption<Period>> = [
  { value: "ALL", label: "All" },
  { value: "D", label: "Day" },
  { value: "N", label: "Night" },
];
const SCALE_OPTIONS: ReadonlyArray<SegmentOption<Scale>> = [
  { value: "harmonized", label: "Harmonized" },
  { value: "raw", label: "Raw by sensor" },
];
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
const UNIT = "VIIRS-equivalent hotspot detections per month";

const API_TEXT = { checking: "Checking API…", ok: "API connected", unavailable: "API unavailable" } as const;

/** Layout of docs/spec/dashboard.md section 2. The map (D3) and the calendar (D4) fill the two panels next. */
export function DashboardPage() {
  const [state, dispatch] = useDashboard();
  const apiStatus = useApiStatus();

  return (
    <div className="page">
      <header className="header">
        <div className="header-title">
          <h1>Hotspot calendar: Northeast Brazil</h1>
          <p className="subtitle">Harmonized MODIS and VIIRS active-fire hotspots, 2003 to present</p>
          <p className="status" role="status" aria-live="polite">
            {API_TEXT[apiStatus]}
          </p>
        </div>
        <AboutDialog />
      </header>

      <div className="control-bar" role="group" aria-label="Filters">
        <YearSelect
          label="From"
          value={state.startYear}
          years={YEARS}
          onChange={(startYear) => dispatch({ type: "setYears", startYear, endYear: state.endYear })}
        />
        <YearSelect
          label="To"
          value={state.endYear}
          years={YEARS}
          onChange={(endYear) => dispatch({ type: "setYears", startYear: state.startYear, endYear })}
        />
        <SegmentedControl
          label="Time of day"
          options={PERIOD_OPTIONS}
          value={state.period}
          onChange={(period) => dispatch({ type: "setPeriod", period })}
        />
        <SegmentedControl
          label="Scale"
          options={SCALE_OPTIONS}
          value={state.scale}
          onChange={(scale) => dispatch({ type: "setScale", scale })}
        />
      </div>

      <main className="dashboard-grid">
        <Card title="Map" className="dashboard-map" caption="Source: NASA FIRMS · 0.25° cells · selected month">
          <div className="panel-placeholder">Map of 0.25° cells and area selection (task D3).</div>
        </Card>
        <Card
          title="Burning calendar"
          className="dashboard-calendar calendar-theme"
          caption={`Source: NASA FIRMS · ${state.startYear}–${state.endYear} · ${UNIT}`}
        >
          <BurningCalendar />
        </Card>
        <Card title="This month vs historical median" className="dashboard-stat">
          <StatTile
            label="Current month"
            value={null}
            median={null}
            baselineLabel="the historical median"
            unit={UNIT}
          />
        </Card>
      </main>

      <footer className="footer">
        <p>
          <strong>What this shows:</strong> hotspots are satellite thermal detections. They are not confirmed fires and
          not burned area. Estimates for years before 2012 carry extra uncertainty.
        </p>
        <p>
          Data: NASA FIRMS (MODIS and VIIRS active fire products). This prototype is exploratory and must not be used for
          emergency or resource decisions.
        </p>
      </footer>
    </div>
  );
}
