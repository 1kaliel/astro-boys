import { useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { EvidenceDialog } from "../../components/ui/EvidenceDialog";
import { KpiTile } from "../../components/viz/KpiTile";
import type { CalendarMonth } from "../../data/calendarSource";
import { formatCompact, formatCount, MONTHS_LONG } from "../../lib/format";
import {
  aboveUsual,
  busiestMonth,
  deltaText,
  latestKpiText,
  peakMonth,
  percentChange,
  totalActivity,
  UNUSUAL_Z,
} from "../../lib/metrics";
import type { Bounds, Period } from "../../state/dashboard";
import { aboveEvidence, peakEvidence, totalEvidence, type Evidence } from "./kpiEvidence";

type KpiRowProps = {
  /** The whole series of the area; each card cuts it to the selected years itself. */
  months: readonly CalendarMonth[];
  startYear: number;
  endYear: number;
  /** Years the median is computed over; null when there is no complete month. */
  baselineYears: readonly [number, number] | null;
  area: Bounds;
  period: Period;
  modelVersion: string;
  /** Shows a month everywhere (the map, the sidebar, the timeline). */
  onPickMonth?: (year: number, month: number) => void;
};

/**
 * The three indicators of the team proposal, all for the selected area, years and time of day:
 * total activity, the peak month, and how many months were above the usual level.
 */
export function KpiRow({ months, startYear, endYear, baselineYears, area, period, modelVersion, onPickMonth }: KpiRowProps) {
  const context = { area, period, modelVersion, startYear, endYear };
  const years = startYear === endYear ? String(startYear) : `${startYear}–${endYear}`;
  const total = totalActivity(months, startYear, endYear);
  const peak = peakMonth(months, startYear, endYear);
  const usualPeak = busiestMonth(months);
  const above = aboveUsual(months, startYear, endYear);
  const baseline = baselineYears ? `${baselineYears[0]}–${baselineYears[1]}` : "the baseline years";
  const latest = months.at(-1) ?? null;
  const latestText = latest && latest.year <= endYear && latest.year >= startYear ? latestKpiText(latest) : null;

  const sameDays = latestText?.comparison && latest?.isPartial ? latestText.comparison.replace(/^[▲▼] /, "") : null;
  const latestMonth = latest ? `${MONTHS_LONG[latest.month - 1]} ${latest.year}` : "";

  // Each card shows its figure, one line of what it counts and one comparison. The rest (estimated months, the
  // month so far, the baseline years) is in the card's evidence panel, one click away.
  return (
    <section className="kpi-row kpi-row-3" aria-label="Key figures for the selected area" data-tour="kpis">
      <KpiTile
        hero
        label={`Total activity, ${years}`}
        evidence={total ? totalEvidence(months, context) : null}
        value={formatCompact(total?.value)}
        detail={total ? `VIIRS-equivalent hotspots in ${total.months} months` : "No data for these years"}
        comparison={
          total?.complete
            ? deltaText(total.complete.value, total.complete.median, `the usual level of the same ${total.complete.months} months`)
            : undefined
        }
        badges={
          total &&
          (total.estimated > 0 || total.partial) && (
            <>
              {total.estimated > 0 && <Badge kind="estimated" />}
              {total.partial && latest?.isPartial && <Badge kind="partial" />}
            </>
          )
        }
        notes={
          total && (
            <ul>
              {total.estimated > 0 && <li>{`${total.estimated} of the ${total.months} months are estimated from MODIS.`}</li>}
              {total.missing > 0 && <li>{`${total.missing} months without an estimate, left out.`}</li>}
              {total.partial && latest?.isPartial && <li>{`${latestMonth}: ${latest.daysObserved} days so far.`}</li>}
              {sameDays && latest && <li>{`${MONTHS_LONG[latest.month - 1]} so far: ${sameDays}`}</li>}
            </ul>
          )
        }
      />
      <KpiTile
        label={`Peak month, ${years}`}
        evidence={peak ? peakEvidence(months, context) : null}
        value={peak ? `${MONTHS_LONG[peak.month - 1]} ${peak.year}` : "No data"}
        detail={peak ? `${formatCount(peak.count ?? 0)} hotspots${peak.isEstimated ? " (estimated)" : ""}` : undefined}
        action={
          peak && onPickMonth ? (
            <button type="button" className="kpi-link" onClick={() => onPickMonth(peak.year, peak.month)}>
              Show {MONTHS_LONG[peak.month - 1]} {peak.year} on the map
            </button>
          ) : undefined
        }
        comparison={
          usualPeak ? `Usual peak: ${MONTHS_LONG[usualPeak.month - 1]} (median ${formatCompact(usualPeak.median)})` : undefined
        }
        notes={
          peak && (
            <ul>
              <li>{`${formatCount(peak.count ?? 0)} VIIRS-equivalent hotspots${peak.isEstimated ? " (estimated)" : ""}.`}</li>
              {usualPeak && (
                <li>{`Usual peak: ${MONTHS_LONG[usualPeak.month - 1]} (median ${formatCompact(usualPeak.median)}, ${baseline}).`}</li>
              )}
            </ul>
          )
        }
      />
      <KpiTile
        label="Months above usual"
        evidence={above.judged > 0 ? aboveEvidence(months, context) : null}
        value={above.judged > 0 ? `${above.above} of ${above.judged}` : "No data"}
        detail={above.judged > 0 ? "complete months above the median of their month of the year" : "No complete month in these years"}
        comparison={
          above.judged > 0
            ? `${above.unusual} unusually high (robust z ≥ ${UNUSUAL_Z}). An anomaly, not a risk level.`
            : undefined
        }
        notes={
          above.judged > 0 && (
            <ul>
              <li>{`Complete months above the median of their month of the year, ${baseline}.`}</li>
            </ul>
          )
        }
      />
    </section>
  );
}

/** One figure of the inline line: a short text that opens the same evidence panel as its card. */
function InlineFigure({ text, label, title, evidence }: { text: string; label: string; title: string; evidence: Evidence | null }) {
  const [open, setOpen] = useState(false);
  if (!evidence) return <li className="kpi-inline-item">{text}</li>;
  return (
    <li className="kpi-inline-item">
      <button type="button" className="kpi-inline-open" aria-haspopup="dialog" aria-label={label} onClick={() => setOpen(true)}>
        {text}
      </button>
      <EvidenceDialog title={title} evidence={evidence} open={open} onOpenChange={setOpen} />
    </li>
  );
}

/**
 * The three period figures as one line ("4.2M hotspots ▼11% · Peak Sep 2017 · 62/118 above usual"), for the
 * explorer's panel header. Each item opens the evidence panel of its card (records and source).
 */
export function KpiInline({ months, startYear, endYear, area, period, modelVersion }: Omit<KpiRowProps, "baselineYears" | "onPickMonth">) {
  const context = { area, period, modelVersion, startYear, endYear };
  const years = startYear === endYear ? String(startYear) : `${startYear}–${endYear}`;
  const total = totalActivity(months, startYear, endYear);
  const peak = peakMonth(months, startYear, endYear);
  const above = aboveUsual(months, startYear, endYear);
  const change = total?.complete ? percentChange(total.complete.value, total.complete.median) : null;
  const changeText = change === null ? "" : ` ${change >= 0 ? "▲" : "▼"}${Math.abs(Math.round(change))}%`;
  const peakName = peak ? `${MONTHS_LONG[peak.month - 1].slice(0, 3)} ${peak.year}` : null;
  return (
    <ul className="kpi-inline" aria-label={`The period in figures, ${years}`}>
      <InlineFigure
        text={total ? `${formatCompact(total.value)} hotspots${changeText}` : "No data"}
        label={`Total activity, ${years}: ${formatCompact(total?.value)} VIIRS-equivalent hotspots${
          change === null ? "" : `, ${Math.abs(Math.round(change))}% ${change >= 0 ? "above" : "below"} the usual level`
        }. Show the records and the source`}
        title={`Total activity, ${years}`}
        evidence={total ? totalEvidence(months, context) : null}
      />
      <InlineFigure
        text={peakName ? `Peak ${peakName}` : "No peak"}
        label={`Peak month, ${years}: ${peak ? `${MONTHS_LONG[peak.month - 1]} ${peak.year}` : "no data"}. Show the records and the source`}
        title={`Peak month, ${years}`}
        evidence={peak ? peakEvidence(months, context) : null}
      />
      <InlineFigure
        text={above.judged > 0 ? `${above.above}/${above.judged} above usual` : "No complete month"}
        label={`Months above usual: ${above.above} of ${above.judged} complete months. Show the records and the source`}
        title="Months above usual"
        evidence={above.judged > 0 ? aboveEvidence(months, context) : null}
      />
    </ul>
  );
}
