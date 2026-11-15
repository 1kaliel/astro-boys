import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import { KpiIcon, type KpiIconName } from "./kpiIcons";

/** Which of the four indicator colors the card takes (an interface color, never a data scale). */
export type KpiVariant = "activity" | "season" | "year" | "provenance";

type KpiTileProps = {
  variant: KpiVariant;
  /** Short upper-case category, for example "Current activity". */
  category: string;
  /** Name of the indicator, sentence case, no trailing colon. */
  title: string;
  /** Already formatted figure; "No data" when missing, never 0. */
  value: string;
  /** The comparison or reference, in ink: more or fewer hotspots is not "good" or "bad". */
  comparison?: ReactNode;
  /** One line of supporting detail. */
  detail?: ReactNode;
  /** Period, origin, observation state or the methodological note. */
  footer?: ReactNode;
  /** True when the tile sits inside a detail panel (Dialog.Root): it then gets the control that opens it. */
  opens?: boolean;
};

const ICON_OF: Record<KpiVariant, KpiIconName> = {
  activity: "activity",
  season: "season",
  year: "year",
  provenance: "provenance",
};

/** Same four-part layout for every indicator: header (category + icon), content, footer. With `opens`, the whole tile opens its records. */
export function KpiTile({ variant, category, title, value, comparison, detail, footer, opens }: KpiTileProps) {
  return (
    <article className={cx("kpi", `kpi-${variant}`)} aria-label={`${category}: ${title}`}>
      <header className="kpi-head">
        <span className="kpi-category">{category}</span>
        <span className="kpi-icon">
          <KpiIcon name={ICON_OF[variant]} />
        </span>
      </header>
      <div className="kpi-body">
        <p className="kpi-title">{title}</p>
        <p className="kpi-value">{value}</p>
        {comparison && <p className="kpi-comparison">{comparison}</p>}
        {detail && <p className="kpi-detail">{detail}</p>}
      </div>
      {footer && <footer className="kpi-footer">{footer}</footer>}
      {opens && (
        <Dialog.Trigger className="kpi-open" aria-label={`${category}: ${title}. Open the records behind this figure`}>
          See the records
        </Dialog.Trigger>
      )}
    </article>
  );
}
