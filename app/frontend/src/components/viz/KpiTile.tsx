import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

type KpiTileProps = {
  /** Sentence case, no trailing colon. */
  label: string;
  /** Already formatted (compact) figure; "No data" when missing, never 0. */
  value: string;
  /** What the figure counts and over which period (unit · period). */
  detail?: ReactNode;
  /** Delta vs a named baseline, on its own line and in ink: more or fewer hotspots is not "good" or "bad". */
  comparison?: ReactNode;
  badges?: ReactNode;
  /** The one figure the dashboard leads with (exactly one per view). */
  hero?: boolean;
};

export function KpiTile({ label, value, detail, comparison, badges, hero }: KpiTileProps) {
  return (
    <div className={cx("kpi", hero && "kpi-hero")}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {detail && <p className="kpi-detail">{detail}</p>}
      {comparison && <p className="kpi-comparison">{comparison}</p>}
      {badges && <div className="kpi-badges">{badges}</div>}
    </div>
  );
}
