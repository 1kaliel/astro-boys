import { Fragment } from "react";
import type { WeatherField } from "../../lib/weatherField";
import { SURFACE_BREAKS } from "../../lib/thermalSurface";
import { Button } from "../ui/Button";

type OverviewLegendProps = {
  field: WeatherField | null;
  /** The month of the hotspots on screen, for example "October 2015". */
  hotspotsMonth: string | null;
  /** Whether that month is the current one. */
  current: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

const day = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${m}`;
};

/** Legend of the temperature surface of the overview: classes in °C, how it was drawn and which period it is. */
export function OverviewLegend({ field, hotspotsMonth, current, loading, error, onRetry }: OverviewLegendProps) {
  // While a past month loads there is no field yet, but the wording is already the month's: never "now".
  const month = field ? field.kind === "month" : !current;
  const periodName = hotspotsMonth ?? "this month";
  return (
    <div className="legend weather-legend" aria-label="Legend: temperature">
      <div className="legend-row">
        <span className="legend-classes">
          {[...SURFACE_BREAKS, null].map((edge, i) => (
            <Fragment key={i}>
              <span className="legend-step" aria-hidden="true" style={{ background: `var(--viz-thermal-${i + 1})` }} />
              {edge !== null && <span className="legend-break">{edge}</span>}
            </Fragment>
          ))}
        </span>
      </div>
      <p className="legend-note">
        {month ? "Mean air temperature at 2 m" : "Air temperature at 2 m now"} (°C), fixed classes
        {month ? `: the ERA5 monthly mean of the daily means of ${periodName}` : ""}. Drawn from{" "}
        {field ? `${field.points.length} sampled points ${field.step_deg}° apart` : "the sampled points"}, interpolated
        between them: it shows the regional pattern, not observations in between. Where there is no sample, nothing is
        drawn.
        {field && ` ${field.reference}.`}
      </p>
      {!field && loading && (
        <p className="legend-note" role="status">
          Loading the {current ? "current" : "ERA5"} weather of {periodName}…{" "}
          {!current && "The first request for a month can take several seconds."}
        </p>
      )}
      {!field && !loading && error && (
        <p className="legend-note" role="alert">
          The weather of {periodName} could not be loaded: {error} No other period is shown in its place.{" "}
          <Button onClick={onRetry}>Try again</Button>
        </p>
      )}
      {field && month && field.status === "partial" && (
        <p className="legend-note" role="status">
          ERA5 has values only up to {field.availableThrough ? day(field.availableThrough) : "an earlier day"}: the
          later days of the month are missing and are not filled in.
        </p>
      )}
      {hotspotsMonth && field && (
        <p className="legend-note">
          {month
            ? `The weather is the ERA5 monthly mean of the same month as the hotspots (${hotspotsMonth}).`
            : `Hotspots (${hotspotsMonth}) and the weather are of the current month; the weather is the latest available.`}
        </p>
      )}
    </div>
  );
}
