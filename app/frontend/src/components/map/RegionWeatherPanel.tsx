import { cardinal, type RegionAnswer } from "../../lib/regionWeather";
import type { WeatherField } from "../../lib/weatherField";
import { Button } from "../ui/Button";

type RegionWeatherPanelProps = {
  answer: RegionAnswer;
  field: WeatherField;
  onClose: () => void;
};

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
export function RegionWeatherPanel({ answer, field, onClose }: RegionWeatherPanelProps) {
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
          <dd>{field.source}</dd>
        </div>
        <div>
          <dt>Reference time</dt>
          <dd>{field.reference}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{field.model}</dd>
        </div>
      </dl>
      <p className="region-panel-note">{methodText(answer, field.step_deg)}</p>
      {field.stale && (
        <p className="region-panel-note" role="status">
          Last good answer, not a fresh one: {field.staleReason}
        </p>
      )}
    </aside>
  );
}
