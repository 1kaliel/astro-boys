import type { DrilldownResponse } from "../../data/api";
import { formatCount, MONTHS_LONG } from "../../lib/format";
import { drillStops } from "../../lib/scale";
import { nativeDetections, satelliteName } from "./drill";

type DrillLegendProps = { data: DrilldownResponse; breaks: readonly number[] };

/**
 * Legend of the L3 drill-down, separate from the map's harmonized legend: its own classes, from the counts of these
 * 16 sub-cells only, and it names the one satellite the counts come from. Native counts, never VIIRS-equivalent.
 */
export function DrillLegend({ data, breaks }: DrillLegendProps) {
  const satellite = satelliteName(data.satellite);
  const month = `${MONTHS_LONG[data.month - 1]} ${data.year}`;
  const stops = data.subdivided ? drillStops(data.l3.map((c) => c.count), breaks) : [];
  return (
    <div className="legend drill-legend" aria-label="Legend of the sub-cells">
      <p className="legend-title">
        Native detections, {satellite} ({data.instrument}), {month}: not harmonized
      </p>
      {stops.length > 0 && (
        <div className="legend-row">
          <ol className="drill-legend-stops" aria-label="Color scale: native detections per sub-cell">
            {stops.map((stop) => (
              <li key={stop.from} className="drill-legend-stop">
                <span className="legend-step" aria-hidden="true" style={{ background: `var(--viz-seq-${stop.step})` }} />
                <span className="legend-break">
                  {stop.from === stop.to ? formatCount(stop.from) : `${formatCount(stop.from)}–${formatCount(stop.to)}`}
                </span>
              </li>
            ))}
          </ol>
          <span className="legend-unit">per 0.0625° sub-cell (about 7 km) · sub-cells with no detection are not filled</span>
        </div>
      )}
      <p className="legend-note">
        {nativeDetections(data.total)} in cell {data.cell}
        {data.subdivided ? " · colors are equal steps between the lowest and highest sub-cell" : ""}. Dashed outlines:
        the 8 neighboring 0.25° cells, labeled with their native count. Counts of one satellite, for context: harmonized
        VIIRS-equivalent estimates exist only for 0.25° cells. No detection does not mean no fire.
      </p>
    </div>
  );
}
