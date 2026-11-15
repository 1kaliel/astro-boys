import { useMemo, useState } from "react";
import { hotspotsDailyUrl, useRemote, type DailyHotspotsResponse } from "../../data/api";
import { YearSelect } from "../../components/ui/YearSelect";
import ContributionSkyline from "../../components/viz/ContributionSkyline";
import { useDashboard } from "../../state/dashboard";

/** The Skyline sensor and the years it covers: VIIRS S-NPP, complete years only (it starts in February 2012 and its
 *  last full year is 2025; 2026 is partial, so its missing days would read as zeros). */
export const SKYLINE_SENSOR = "SNPP";
export const SKYLINE_YEARS = Array.from({ length: 2025 - 2013 + 1 }, (_, i) => 2013 + i);

/** The daily Skyline of the calendar: one year of one sensor, for the area and period on screen. */
export function SkylineTab() {
  const [state] = useDashboard();
  const years = SKYLINE_YEARS;
  const [year, setYear] = useState(() => Math.min(2025, Math.max(2013, state.endYear)));
  const shownYear = years.includes(year) ? year : years[years.length - 1];
  const url = hotspotsDailyUrl(SKYLINE_SENSOR, state.area, shownYear, state.period);
  const remote = useRemote<DailyHotspotsResponse>(url);
  const days = useMemo(() => remote.data?.days ?? [], [remote.data]);

  return (
    <div className="skyline-tab">
      <div className="control">
        <span className="control-label">Year</span>
        <YearSelect label="Year" value={shownYear} years={years} onChange={setYear} />
      </div>
      {remote.error && (
        <p className="calendar-status" role="alert">
          The daily hotspots could not be loaded: {remote.error}
        </p>
      )}
      {!remote.data && !remote.error && (
        <p className="calendar-status" role="status">
          Loading the daily hotspots of {shownYear}…
        </p>
      )}
      {remote.data && (
        <ContributionSkyline
          days={days}
          endDate={`${shownYear}-12-31`}
          unit="hotspot detection"
          title={`${remote.data.sensor_name}: native hotspot detections per day, ${shownYear}`}
          locale="en-US"
          footer={`${remote.data.sensor_name} · ${state.period === "ALL" ? "day and night" : state.period === "D" ? "day only" : "night only"} · native counts, not harmonized: they are not comparable with the MODIS years. A day with no detections is a measured zero.`}
        />
      )}
    </div>
  );
}
