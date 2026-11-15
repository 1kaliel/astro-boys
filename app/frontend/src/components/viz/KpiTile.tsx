import { useState, type ReactNode } from "react";
import type { Evidence } from "../../features/dashboard/kpiEvidence";
import { cx } from "../../lib/cx";
import { EvidenceDialog } from "../ui/EvidenceDialog";

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
  /** When given, the whole card opens a panel with the records behind the figure and their source. */
  evidence?: Evidence | null;
};

export function KpiTile({ label, value, detail, comparison, badges, hero, evidence }: KpiTileProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cx("kpi", hero && "kpi-hero", evidence && "kpi-clickable")}>
      <p className="kpi-label">
        {evidence ? (
          // Stretched button: its ::after covers the card, so the whole card is the target.
          <button type="button" className="kpi-open" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            {label}
            <span className="sr-only">: {value}. Show the records and the source</span>
          </button>
        ) : (
          label
        )}
      </p>
      <p className="kpi-value">{value}</p>
      {detail && <p className="kpi-detail">{detail}</p>}
      {comparison && <p className="kpi-comparison">{comparison}</p>}
      {badges && <div className="kpi-badges">{badges}</div>}
      {evidence && (
        <>
          <p className="kpi-source-hint" aria-hidden="true">
            Source and records ›
          </p>
          <EvidenceDialog title={label} evidence={evidence} open={open} onOpenChange={setOpen} />
        </>
      )}
    </div>
  );
}
