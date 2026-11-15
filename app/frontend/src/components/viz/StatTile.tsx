import { Badge } from "../ui/Badge";
import { formatCount, formatPercent, formatSigned } from "../../lib/format";

type StatTileProps = {
  label: string;
  /** Current value; null when there is no data (never shown as 0). */
  value: number | null;
  median: number | null;
  /** e.g. "median of Novembers 2003–2025" */
  baselineLabel: string;
  unit: string;
  estimated?: boolean;
  partial?: { daysObserved: number; daysInMonth: number } | null;
};

/**
 * Hero figure: this month vs the historical median. The delta is ink, not red or green:
 * more or fewer hotspots is not "good" or "bad", and the product makes no risk claims.
 */
export function StatTile({ label, value, median, baselineLabel, unit, estimated, partial }: StatTileProps) {
  const delta = value != null && median != null ? value - median : null;
  const pct = delta != null && median != null && median > 0 ? (100 * delta) / median : null;
  const direction = delta == null || delta === 0 ? "" : delta > 0 ? "▲" : "▼";

  return (
    <div className="stat-tile">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{formatCount(value)}</p>
      <p className="stat-unit">{unit}</p>
      <p className="stat-delta">
        {delta == null ? (
          "No comparison available"
        ) : (
          <>
            <span aria-hidden="true">{direction} </span>
            {formatSigned(delta)}
            {formatPercent(pct) && ` (${formatPercent(pct)})`} vs {baselineLabel}
            {pct == null && median === 0 && " (percent undefined: median is 0)"}
          </>
        )}
      </p>
      <div className="stat-badges">
        {estimated && <Badge kind="estimated" />}
        {partial && (
          <Badge kind="partial">
            Partial month: {partial.daysObserved} of {partial.daysInMonth} days, compared with the same days of earlier
            years
          </Badge>
        )}
      </div>
    </div>
  );
}
