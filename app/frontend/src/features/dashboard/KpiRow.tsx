import { Badge } from "../../components/ui/Badge";
import { KpiTile } from "../../components/viz/KpiTile";
import type { CalendarMonth } from "../../data/calendarSource";
import { formatCompact, MONTHS_LONG } from "../../lib/format";
import type { Bounds, Period } from "../../state/dashboard";
import { busiestEvidence, estimatedEvidence, latestEvidence, yearToDateEvidence } from "./kpiEvidence";
import { busiestMonth, deltaText, estimatedShare, latestKpiText, yearToDate } from "../../lib/metrics";

type KpiRowProps = {
  /** The whole series of the area (not cut to the year range): "latest" means the latest month in the data. */
  months: readonly CalendarMonth[];
  startYear: number;
  endYear: number;
  /** Years the median is computed over; null when there is no complete month. */
  baselineYears: readonly [number, number] | null;
  area: Bounds;
  period: Period;
  modelVersion: string;
};

export function KpiRow({ months, startYear, endYear, baselineYears, area, period, modelVersion }: KpiRowProps) {
  const context = { area, period, modelVersion, startYear, endYear };
  const latest = months.at(-1) ?? null;
  const busiest = busiestMonth(months);
  const ytd = yearToDate(months);
  // The whole record, not the years on screen: with a 10-year window it would always read "0 of 118".
  const share = estimatedShare(months);
  const recordYears = months.length > 0 ? `${months[0].year}–${months[months.length - 1].year}` : "";
  const baseline = baselineYears ? `${baselineYears[0]}–${baselineYears[1]}` : "the baseline";
  const monthName = latest ? MONTHS_LONG[latest.month - 1] : "";
  const hero = latestKpiText(latest);

  return (
    <section className="kpi-row" aria-label="Key figures for the selected area">
      <KpiTile
        hero
        evidence={latest ? latestEvidence(latest, context) : null}
        label={latest ? `${monthName} ${latest.year}${latest.isPartial ? " so far" : ""}` : "Latest month"}
        value={formatCompact(latest?.count)}
        detail={hero.detail}
        comparison={hero.comparison}
        badges={
          latest && (
            <>
              {latest.isEstimated && <Badge kind="estimated" />}
              {latest.isPartial && <Badge kind="partial">{`Partial: ${latest.daysObserved} days observed`}</Badge>}
            </>
          )
        }
      />
      <KpiTile
        label="Busiest month of the year"
        evidence={busiest ? busiestEvidence(months, context) : null}
        value={busiest ? MONTHS_LONG[busiest.month - 1] : "No data"}
        detail={busiest ? `Median ${formatCompact(busiest.median)} hotspots, ${baseline}` : undefined}
      />
      <KpiTile
        label={ytd ? `${ytd.year} so far` : "Year so far"}
        evidence={ytd ? yearToDateEvidence(months, context) : null}
        value={formatCompact(ytd?.value)}
        detail={
          ytd
            ? `${deltaText(ytd.value, ytd.median, `the sum of ${ytd.months} monthly medians`)}${
                ytd.partial ? " · partial month left out" : ""
              }`
            : undefined
        }
      />
      <KpiTile
        label="Months estimated from MODIS"
        evidence={share.total > 0 ? estimatedEvidence(months, context) : null}
        value={`${share.estimated} of ${share.total}`}
        detail={`Whole record, ${recordYears}. Observed by VIIRS from February 2012.`}
      />
    </section>
  );
}
