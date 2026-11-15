import type { LiveWindResponse } from "../../data/api";
import { prefersReducedMotion } from "../../lib/hooks";
import { TIMELAPSE_HOURS_PER_SECOND } from "../map/WindParticles";
import { Button } from "../ui/Button";

type LiveWindLegendProps = {
  data: LiveWindResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

/** "06:45 UTC" from an ISO time of the model ("2026-11-15T06:45"). */
function clock(iso: string | null): string {
  return iso ? `${iso.slice(11, 16)} UTC` : "unknown time";
}

/** Legend of the live wind layer: what the streaks are, how old the data is and what it is not. */
export function LiveWindLegend({ data, loading, error, onRetry }: LiveWindLegendProps) {
  const speeds = data?.points.flatMap((p) => (p.wind_speed_kmh === null ? [] : [p.wind_speed_kmh])) ?? [];
  const fastest = speeds.length > 0 ? Math.max(...speeds) : null;
  const still = prefersReducedMotion();

  return (
    <div className="legend weather-legend" aria-label="Legend: live wind">
      {!data && loading && (
        <p className="legend-note" role="status">
          Loading the live wind…
        </p>
      )}
      {!data && error && (
        <p className="legend-note" role="alert">
          The live wind could not be loaded: {error} <Button onClick={onRetry}>Try again</Button>
        </p>
      )}
      {data && (
        <>
          <p className="legend-note">
            <strong>Latest available wind</strong> · model time {clock(data.model_time)}. The server refreshes it every
            {Math.round(data.ttl_seconds / 60)} minutes and this page checks for a new one on its own.
            {fastest !== null && ` Fastest sampled wind: ${Math.round(fastest)} km/h.`}
          </p>
          {data.stale && (
            <p className="legend-note" role="status">
              Showing the last good answer, not a fresh one: {data.stale_reason}
            </p>
          )}
          <p className="legend-note">
            {still
              ? "Each arrow points where the wind blows toward."
              : `Streaks follow the wind, brighter where it is faster. The animation runs about ${TIMELAPSE_HOURS_PER_SECOND} hours of flow per second and is interpolated between points ${data.step_deg}° apart: it shows the pattern of the current field, not the path of an air parcel.`}{" "}
            It covers a wide region, not only the study area. Where there is no value, nothing is drawn.
          </p>
        </>
      )}
      <p className="legend-note">
        Context only: not hotspots, not ERA5, and not station observations. Source: Open-Meteo Forecast API (CC BY 4.0),
        current conditions of the weather model, which are not a forecast of fire.
      </p>
    </div>
  );
}
