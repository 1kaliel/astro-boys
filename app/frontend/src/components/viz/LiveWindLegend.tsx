import { prefersReducedMotion } from "../../lib/hooks";
import type { WeatherField } from "../../lib/weatherField";
import { TIMELAPSE_HOURS_PER_SECOND } from "../map/WindParticles";
import { Button } from "../ui/Button";

type LiveWindLegendProps = {
  field: WeatherField | null;
  /** "the weather now" or "October 2015", for the messages while the field is not there. */
  periodName: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

/** Legend of the wind: what the streaks are, which period they are from and what they are not. */
export function LiveWindLegend({ field, periodName, loading, error, onRetry }: LiveWindLegendProps) {
  const speeds = field?.points.flatMap((p) => (p.flow_kmh === null ? [] : [p.flow_kmh])) ?? [];
  const fastest = speeds.length > 0 ? Math.max(...speeds) : null;
  const still = prefersReducedMotion();
  const month = field?.kind === "month";

  return (
    <div className="legend weather-legend" aria-label="Legend: wind">
      {!field && loading && (
        <p className="legend-note" role="status">
          Loading the wind of {periodName}…
        </p>
      )}
      {!field && !loading && error && (
        <p className="legend-note" role="alert">
          The wind of {periodName} could not be loaded: {error} <Button onClick={onRetry}>Try again</Button>
        </p>
      )}
      {field && (
        <>
          <p className="legend-note">
            <strong>{field.windLabel}</strong> · {month ? field.reference : `model time ${field.reference}`}.{" "}
            {month
              ? "It is the mean wind vector of the month: where the wind blew on average, not the circulation at any instant."
              : `The server refreshes it every ${Math.round((field.ttlSeconds ?? 0) / 60)} minutes and this page checks for a new one on its own.`}
            {fastest !== null && ` Fastest sampled ${month ? "mean flow" : "wind"}: ${Math.round(fastest)} km/h.`}
          </p>
          {field.stale && (
            <p className="legend-note" role="status">
              Showing the last good answer, not a fresh one: {field.staleReason}
            </p>
          )}
          <p className="legend-note">
            {still
              ? "Each arrow points where the wind blows toward."
              : `Streaks follow the wind, brighter where it is faster. The animation runs about ${TIMELAPSE_HOURS_PER_SECOND} hours of flow per second and is interpolated between points ${field.step_deg}° apart: it shows the pattern of ${month ? "the mean flow of the month" : "the current field"}, not the path of an air parcel.`}{" "}
            The wind is drawn inside Brazil only. Where there is no value, nothing is drawn.
          </p>
        </>
      )}
      <p className="legend-note">
        Context only: not hotspots, and not station observations.{" "}
        {month
          ? "Source: Open-Meteo Historical Weather API (CC BY 4.0), ERA5 reanalysis, Copernicus Climate Change Service / ECMWF."
          : "Source: Open-Meteo Forecast API (CC BY 4.0), current conditions of the weather model, which are not a forecast of fire."}
      </p>
    </div>
  );
}
