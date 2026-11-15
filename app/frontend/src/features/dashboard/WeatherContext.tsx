import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { useRemote, weatherUrl, type WeatherResponse } from "../../data/api";
import { MONTHS_LONG } from "../../lib/format";
import { useDashboard } from "../../state/dashboard";

type WeatherContextProps = {
  /** The month the calendar has selected, or the latest month of the data. */
  month: { year: number; month: number };
};

/** "14 Nov" from an ISO date, in UTC like the days of the data. */
function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_LONG[m - 1].slice(0, 3)}`;
}

function Stat({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="weather-stat">
      <dt className="weather-label">{label}</dt>
      <dd className="weather-value">
        {value}
        {unit && <span className="weather-unit"> {unit}</span>}
      </dd>
      {note && <dd className="weather-note">{note}</dd>}
    </div>
  );
}

/**
 * Weather context (proof of concept): ERA5 temperature and wind for the area and the month of the calendar.
 * It is separate from the hotspots on purpose: it says what the atmosphere was like, not why anything was detected.
 */
export function WeatherContext({ month }: WeatherContextProps) {
  const [state] = useDashboard();
  const remote = useRemote<WeatherResponse>(weatherUrl(state.area, month));
  const data = remote.data;
  const title = `${MONTHS_LONG[month.month - 1]} ${month.year}`;

  let body;
  if (!data && remote.loading) {
    body = (
      <p className="weather-status" role="status">
        Loading the ERA5 weather context…
      </p>
    );
  } else if (!data) {
    body = (
      <div className="weather-status" role="alert">
        <p>The weather context could not be loaded. The hotspot figures are not affected. {remote.error}</p>
        <Button onClick={remote.retry}>Try again</Button>
      </div>
    );
  } else if (data.status === "unavailable") {
    body = (
      <p className="weather-status" role="status">
        ERA5 has no values for {title} yet: it is published a few days after the fact.
      </p>
    );
  } else {
    const sampled = data.points_used < data.points_in_area;
    body = (
      <>
        <dl className="weather-grid">
          <Stat
            label="Air temperature, 2 m"
            value={data.temperature_mean_c === null ? "No data" : data.temperature_mean_c.toFixed(1)}
            unit={data.temperature_mean_c === null ? undefined : "°C"}
            note="Mean of the daily means"
          />
          <Stat
            label="Wind speed, 10 m"
            value={data.wind_speed_mean_kmh === null ? "No data" : data.wind_speed_mean_kmh.toFixed(1)}
            unit={data.wind_speed_mean_kmh === null ? undefined : "km/h"}
            note="Mean of the daily means"
          />
          <Stat
            label="Wind blowing from"
            value={data.wind_direction_from ?? "No prevailing direction"}
            unit={data.wind_direction_from_deg === null ? undefined : `${Math.round(data.wind_direction_from_deg)}°`}
            note={
              data.wind_direction_steadiness === null
                ? undefined
                : `Steadiness ${data.wind_direction_steadiness.toFixed(2)} (1 = always the same direction)`
            }
          />
          <Stat
            label="Days with values"
            value={`${data.days_available} of ${data.days_requested}`}
            note={
              data.status === "partial" && data.available_through
                ? `Latest published day: ${dayLabel(data.available_through)}. Later days are not shown, not estimated.`
                : "Whole period"
            }
          />
        </dl>
        <p className="weather-method">
          Mean of {data.points_used} ERA5 grid points
          {sampled
            ? ` sampled from the ${data.points_in_area.toLocaleString("en-US")} inside the area`
            : " inside the area"}
          , ocean points included. ERA5 is a reanalysis on a 0.25° grid, not a station reading. Days are UTC days.
        </p>
      </>
    );
  }

  return (
    <Card
      className="dash-weather"
      title="Weather context"
      actions={<span className="card-meta">{title} · ERA5</span>}
      caption="Context only: it does not change any hotspot count and does not say that weather caused them. Source: Open-Meteo Historical Weather API (CC BY 4.0), ERA5 reanalysis, Copernicus Climate Change Service / ECMWF; model era5."
    >
      {body}
    </Card>
  );
}
