import type { LiveWindResponse } from "../../data/api";
import { cardinal, type RegionAnswer } from "../../lib/regionWeather";
import { Button } from "../ui/Button";

type RegionWeatherPanelProps = {
  answer: RegionAnswer;
  live: LiveWindResponse;
  onClose: () => void;
};

/** "2026-11-15 07:45 UTC" from the model time ("2026-11-15T07:45"). */
function reference(iso: string | null): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "unknown";
}

/** How the numbers were obtained, in words: a single sample is never called a mean. */
function methodText(answer: RegionAnswer, step: number): string {
  const where = answer.region ?? "the clicked place";
  switch (answer.method) {
    case "mean-of-grid-points":
      return `Mean of ${answer.points} grid points inside ${where} (IBGE outline), equal weights. The points are ${step}° apart, so this describes the region only coarsely.`;
    case "single-grid-point":
      return `One grid point inside ${where}: the only sample there. It is a point value, not a regional mean.`;
    case "nearest-grid-point":
      return `Nearest grid point (${answer.nearest?.lat}°, ${answer.nearest?.lon}°), ${Math.round(answer.nearest?.km ?? 0)} km from the click. A point value, not a regional mean.`;
    default:
      return "No sampled point is near here, so no value is shown.";
  }
}

/** The weather of the clicked region: every field is a real value or says it has none. */
export function RegionWeatherPanel({ answer, live, onClose }: RegionWeatherPanelProps) {
  const has = answer.method !== "none";
  return (
    <aside className="region-panel" aria-label="Region weather">
      <header className="region-panel-head">
        <h3 className="region-panel-title">Region weather</h3>
        <Button className="icon-button" onClick={onClose} aria-label="Close the region weather">
          <span aria-hidden="true">×</span>
        </Button>
      </header>
      <dl className="region-panel-list">
        <div>
          <dt>Region</dt>
          <dd>{answer.region ?? "Outside the Brazilian states"}</dd>
        </div>
        <div>
          <dt>Temperature</dt>
          <dd>{has && answer.temperature_c !== null ? `${answer.temperature_c.toFixed(1)} °C` : "No value"}</dd>
        </div>
        <div>
          <dt>Wind speed</dt>
          <dd>{has && answer.wind_speed_kmh !== null ? `${answer.wind_speed_kmh.toFixed(1)} km/h` : "No value"}</dd>
        </div>
        <div>
          <dt>Wind direction</dt>
          <dd>
            {has && answer.wind_from_deg !== null
              ? `From ${Math.round(answer.wind_from_deg)}° (${cardinal(answer.wind_from_deg)})`
              : has
                ? "No prevailing direction"
                : "No value"}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>Open-Meteo Forecast API</dd>
        </div>
        <div>
          <dt>Reference time</dt>
          <dd>{reference(live.model_time)}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>Open-Meteo weather model, current conditions (best match)</dd>
        </div>
      </dl>
      <p className="region-panel-note">{methodText(answer, live.step_deg)}</p>
      {live.stale && (
        <p className="region-panel-note" role="status">
          Last good answer, not a fresh one: {live.stale_reason}
        </p>
      )}
    </aside>
  );
}
