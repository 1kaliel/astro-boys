import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

export type BadgeKind = "estimated" | "partial" | "nrt" | "simulated";

const LABELS: Record<BadgeKind, string> = {
  estimated: "Estimated from MODIS",
  partial: "Partial month",
  nrt: "Near real time",
  simulated: "Simulated data",
};

/** Provenance labels. Always a visible label, never color alone. */
export function Badge({ kind, children }: { kind: BadgeKind; children?: ReactNode }) {
  return (
    <span className={cx("badge", `badge-${kind}`)}>
      <span className="badge-mark" aria-hidden="true" />
      {children ?? LABELS[kind]}
    </span>
  );
}
