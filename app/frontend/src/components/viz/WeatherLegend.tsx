import { Fragment } from "react";
import type { WeatherGridResponse } from "../../data/api";
import { rampStep } from "../../lib/scale";
import { LAYER_LABEL, breaksOf, unitOf, type MapLayer } from "../../lib/weatherLayers";

type WeatherLegendProps = {
  layer: Exclude<MapLayer, "hotspots">;
  grid: WeatherGridResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

/** "9 Nov" from an ISO day. */
function day(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
}

/** Legend of a weather layer: its own scale, unit, source and period. Never mixed with the hotspot legend. */
export function WeatherLegend({ layer, grid, loading, error, onRetry }: WeatherLegendProps) {
  const limits = breaksOf(layer);
  const unit = unitOf(layer);
  let status: string | null = null;
  if (loading && !grid) status = "Loading ERA5 weather… the first request for an area can take a few seconds.";
  else if (error && !grid) status = `The weather layer could not be loaded: ${error}`;
  else if (grid?.status === "unavailable")
    status = "ERA5 has no values for this month yet: it is published a few days late.";
  else if (grid?.status === "partial" && grid.available_through)
    status = `ERA5 has values up to ${day(grid.available_through)}; the later days of the month are not shown.`;

  return (
    <div className="legend weather-legend" aria-label={`Legend: ${LAYER_LABEL[layer]}`}>
      {layer === "wind-direction" ? (
        <p className="legend-note">
          Each arrow points where the wind blows <strong>toward</strong> (monthly mean wind vector at one ERA5 grid
          point). The Weather context card says where it blows <em>from</em>.
        </p>
      ) : (
        <>
          <div className="legend-row">
            <span className="legend-classes">
              {[...limits, null].map((edge, i) => (
                <Fragment key={i}>
                  <span
                    className="legend-step"
                    aria-hidden="true"
                    style={{
                      background: `var(--wx-seq-${rampStep(i + 1, limits.length + 1)})`,
                    }}
                  />
                  {edge !== null && <span className="legend-break">{edge}</span>}
                </Fragment>
              ))}
            </span>
          </div>
          <p className="legend-note">
            {layer === "temperature"
              ? `Mean air temperature at 2 m (${unit}), fixed classes for every month`
              : `Mean wind speed at 10 m (${unit}), fixed classes for every month`}
          </p>
        </>
      )}
      {grid && grid.points.length > 0 && (
        <p className="legend-note">
          {`${grid.points.length} ERA5 grid points, ${grid.step_deg}° apart (a sample of the 0.25° grid, not a surface). Days are UTC days.`}
        </p>
      )}
      {status && (
        <p className="legend-note" role={error && !grid ? "alert" : "status"}>
          {status}{" "}
          {error && !grid && (
            <button type="button" className="button" onClick={onRetry}>
              Try again
            </button>
          )}
        </p>
      )}
      <p className="legend-note">
        Context only: not hotspots, and no cause is implied. Source: Open-Meteo Historical Weather API (CC BY 4.0), ERA5
        reanalysis, Copernicus Climate Change Service / ECMWF.
      </p>
    </div>
  );
}
