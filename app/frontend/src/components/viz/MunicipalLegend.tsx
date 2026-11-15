import { Fragment } from "react";
import type { MunicipalitiesGeoJSON, MunicipalitiesWeather, Remote } from "../../data/api";
import { FEELS_LIKE_BREAKS } from "../../lib/municipalities";
import { rampStep } from "../../lib/scale";
import { Button } from "../ui/Button";

type MunicipalLegendProps = {
  geo: Remote<MunicipalitiesGeoJSON>;
  weather: Remote<MunicipalitiesWeather>;
};

/** "07:45 UTC" from the model time ("2026-11-15T07:45"). */
function clock(iso: string | null): string {
  return iso ? `${iso.slice(11, 16)} UTC` : "unknown time";
}

/** Legend of the municipalities layer: the classes, what the values are and are not, and where they come from. */
export function MunicipalLegend({ geo, weather }: MunicipalLegendProps) {
  const data = weather.data;
  const withValue = data?.items.filter((item) => item.apparent_temperature_c !== null).length ?? 0;
  let status: string | null = null;
  if (!geo.data && geo.loading) status = "Loading the municipalities…";
  else if (!geo.data && geo.error) status = `The municipalities could not be loaded: ${geo.error}`;
  else if (!data && weather.loading) status = "Loading the current temperature…";
  else if (!data && weather.error) status = `The temperature could not be loaded: ${weather.error}`;

  return (
    <div className="legend weather-legend" aria-label="Legend: feels-like temperature by municipality">
      <div className="legend-row">
        <span className="legend-classes">
          {[...FEELS_LIKE_BREAKS, null].map((edge, i) => (
            <Fragment key={i}>
              <span
                className="legend-step"
                aria-hidden="true"
                style={{ background: `var(--wx-seq-${rampStep(i + 1, FEELS_LIKE_BREAKS.length + 1)})` }}
              />
              {edge !== null && <span className="legend-break">{edge}</span>}
            </Fragment>
          ))}
        </span>
      </div>
      <p className="legend-note">
        Feels-like temperature now (°C) at the centre of each municipality of Ceará.
        {data &&
          ` Model time ${clock(data.model_time)}; ${withValue} of ${data.items.length} municipalities have a value.`}{" "}
        The colors only split the range: they are not comfort or alert thresholds. Drag with the right button (or two
        fingers) to tilt and turn the map.
      </p>
      {data?.stale && (
        <p className="legend-note" role="status">
          Showing the last good answer, not a fresh one: {data.stale_reason}
        </p>
      )}
      {status && (
        <p className="legend-note" role={weather.error || geo.error ? "alert" : "status"}>
          {status}{" "}
          {(weather.error || geo.error) && (
            <Button
              onClick={() => {
                geo.retry();
                weather.retry();
              }}
            >
              Try again
            </Button>
          )}
        </p>
      )}
      <p className="legend-note">
        Model values, not station readings, taken at one point per municipality. Context only: not hotspots. Sources:
        IBGE (boundaries and names) and Open-Meteo Forecast API (CC BY 4.0), current conditions of the weather model.
      </p>
    </div>
  );
}
