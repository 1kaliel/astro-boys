import { Fragment } from "react";
import type { LiveWindResponse } from "../../data/api";
import { SURFACE_BREAKS } from "../../lib/thermalSurface";

type OverviewLegendProps = {
  live: LiveWindResponse | null;
  /** The month of the hotspots on screen, for example "November 2026". */
  hotspotsMonth: string | null;
  /** Whether that month is the current one (the weather is "now"). */
  sameMonth: boolean;
};

function clock(iso: string | null): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "unknown time";
}

/** Legend of the temperature surface of the overview: classes in °C, how it was drawn and which period it is. */
export function OverviewLegend({ live, hotspotsMonth, sameMonth }: OverviewLegendProps) {
  return (
    <div className="legend weather-legend" aria-label="Legend: temperature now">
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
        Air temperature at 2 m now (°C), fixed classes. Drawn from {live?.points.length ?? "the"} sampled points{" "}
        {live ? `${live.step_deg}° apart` : ""}, interpolated between them: it shows the regional pattern, not
        observations in between. Where there is no sample, nothing is drawn.
        {live && ` Model time ${clock(live.model_time)}.`}
      </p>
      {hotspotsMonth && (
        <p className="legend-note" role={sameMonth ? undefined : "status"}>
          {sameMonth
            ? `Hotspots (${hotspotsMonth}) and the weather are from the same month.`
            : `Different periods: the hotspots are from ${hotspotsMonth}, the temperature and wind are from now. Pick the current month in the calendar to see them together.`}
        </p>
      )}
    </div>
  );
}
