import { Badge } from "../../components/ui/Badge";
import { KpiTile } from "../../components/viz/KpiTile";
import type { CalendarMonth } from "../../data/calendarSource";
import { formatCompact, formatCount, MONTHS_LONG } from "../../lib/format";
import { aboveUsual, busiestMonth, deltaText, latestKpiText, peakMonth, totalActivity, UNUSUAL_Z } from "../../lib/metrics";
import type { Bounds, Period } from "../../state/dashboard";
import { aboveEvidence, peakEvidence, totalEvidence } from "./kpiEvidence";

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
};

/**
 * The three indicators of the team proposal, all for the selected area, years and time of day:
 * total activity, the peak month, and how many months were above the usual level.
 */
export function KpiRow({ months, startYear, endYear, baselineYears, area, period, modelVersion }: KpiRowProps) {
  const context = { area, period, modelVersion, startYear, endYear };
  const years = startYear === endYear ? String(startYear) : `${startYear}–${endYear}`;
  const total = totalActivity(months, startYear, endYear);
  const peak = peakMonth(months, startYear, endYear);
  const usualPeak = busiestMonth(months);
  const above = aboveUsual(months, startYear, endYear);
  const baseline = baselineYears ? `${baselineYears[0]}–${baselineYears[1]}` : "the baseline years";
  const latest = months.at(-1) ?? null;
  const latestText = latest && latest.year <= endYear && latest.year >= startYear ? latestKpiText(latest) : null;

  return (
    <section className="kpi-row kpi-row-3" aria-label="Key figures for the selected area" data-tour="kpis">
      <KpiTile
        hero
        label={`Total activity, ${years}`}
        evidence={total ? totalEvidence(months, context) : null}
        value={formatCompact(total?.value)}
        detail={
          total
            ? `VIIRS-equivalent hotspots in ${total.months} months${
                total.estimated > 0 ? ` · ${total.estimated} estimated from MODIS` : ""
              }${total.missing > 0 ? ` · ${total.missing} without an estimate, left out` : ""}`
            : "No data for these years"
        }
        comparison={
          total?.complete
            ? `${deltaText(total.complete.value, total.complete.median, `the usual level of the same ${total.complete.months} months`)}${
                latestText?.comparison && latest?.isPartial
                  ? ` · ${MONTHS_LONG[latest.month - 1]} so far: ${latestText.comparison.replace(/^[▲▼] /, "")}`
                  : ""
              }`
            : undefined
        }
        badges={
          total &&
          (total.estimated > 0 || total.partial) && (
            <>
              {total.estimated > 0 && <Badge kind="estimated" />}
              {total.partial && latest?.isPartial && (
                <Badge kind="partial">{`${MONTHS_LONG[latest.month - 1]} ${latest.year}: ${latest.daysObserved} days so far`}</Badge>
              )}
            </>
          )
        }
      />
      <KpiTile
        label={`Peak month, ${years}`}
        evidence={peak ? peakEvidence(months, context) : null}
        value={peak ? `${MONTHS_LONG[peak.month - 1]} ${peak.year}` : "No data"}
        detail={
          peak
            ? `${formatCount(peak.count ?? 0)} VIIRS-equivalent hotspots${peak.isEstimated ? " (estimated)" : ""}`
            : undefined
        }
        comparison={
          usualPeak
            ? `Usual peak: ${MONTHS_LONG[usualPeak.month - 1]} (median ${formatCompact(usualPeak.median)}, ${baseline})`
            : undefined
        }
      />
      <KpiTile
        label="Months above usual"
        evidence={above.judged > 0 ? aboveEvidence(months, context) : null}
        value={above.judged > 0 ? `${above.above} of ${above.judged}` : "No data"}
        detail={
          above.judged > 0
            ? `complete months above the median of their month of the year, ${baseline}`
            : "No complete month in these years"
        }
        comparison={
          above.judged > 0
            ? `${above.unusual} unusually high (robust z ≥ ${UNUSUAL_Z}). An anomaly, not a risk level.`
            : undefined
        }
      />
    </section>
  );
}
