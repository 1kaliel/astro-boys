import { Badge } from "../../components/ui/Badge";
import { KpiDetail, type KpiContext } from "../../components/viz/KpiDetail";
import { KpiTile } from "../../components/viz/KpiTile";
import { activityEvidence, provenanceEvidence, seasonEvidence, ytdEvidence } from "../../lib/kpiEvidence";
import type { CalendarMonth } from "../../data/calendarSource";
import { formatCompact, formatCount, MONTHS_LONG } from "../../lib/format";
import { busiestMonth, estimatedShare, inYears, latestComparison, percentChange, yearToDate } from "../../lib/metrics";

type KpiRowProps = {
  /** The whole series of the area (not cut to the year range): "latest" means the latest month in the data. */
  months: readonly CalendarMonth[];
  startYear: number;
  endYear: number;
  /** Years the median is computed over; null when there is no complete month. */
  baselineYears: readonly [number, number] | null;
  context: KpiContext;
};

/**
 * Delta in ink, in words: "▼ 60% below the March median (100)". More or fewer hotspots is not "good" or "bad",
 * and nothing here is a risk. The arrow carries the direction, so the size is shown without a sign.
 */
function delta(value: number, base: number | null, against: string): string {
  if (base == null) return "No comparison available";
  const change = value - base;
  const pct = percentChange(value, base);
  const size = pct != null ? `${formatCount(Math.abs(pct))}%` : formatCount(Math.abs(change));
  if (change === 0) return `Equal to ${against} (${formatCompact(base)})`;
  const [arrow, word] = change > 0 ? ["▲", "above"] : ["▼", "below"];
  return `${arrow} ${size} ${word} ${against} (${formatCompact(base)})`;
}

export function KpiRow({ months, startYear, endYear, baselineYears, context }: KpiRowProps) {
  const latest = months.at(-1) ?? null;
  const busiest = busiestMonth(months);
  const ytd = yearToDate(months);
  const share = estimatedShare(inYears(months, startYear, endYear));
  const baseline = baselineYears ? `${baselineYears[0]}–${baselineYears[1]}` : "the baseline";
  const monthName = latest ? MONTHS_LONG[latest.month - 1] : "";
  const comparison = latest ? latestComparison(latest) : null;

  return (
    <section className="kpi-row" aria-label="Key figures for the selected area">
      <KpiDetail
        category="Current activity"
        title={latest ? `${monthName} ${latest.year}` : "Latest month"}
        evidence={activityEvidence(months, baselineYears)}
        context={context}
      >
        <KpiTile
          opens
          variant="activity"
          category="Current activity"
          title={latest ? `${monthName} ${latest.year}${latest.isPartial ? " so far" : ""}` : "Latest month"}
          value={formatCompact(latest?.count)}
          comparison={
            latest && comparison
              ? latest.count == null
                ? "No estimate for this month"
                : comparison.kind === "same_days"
                  ? // Like for like: days 1..d of this month against days 1..d of earlier years.
                    delta(latest.count, comparison.base, `the median of the same ${comparison.days} days`)
                  : comparison.kind === "none"
                    ? // A partial month is never compared with full months: it would read as "little activity".
                      `Partial month, not compared with the ${monthName} median`
                    : delta(latest.count, comparison.base, `the ${monthName} median`)
              : "No data"
          }
          detail={
            latest && comparison?.kind === "same_days"
              ? `VIIRS-equivalent hotspots · ${comparison.years} earlier years`
              : "VIIRS-equivalent hotspots"
          }
          footer={
            latest && (
              <>
                {latest.isEstimated && <Badge kind="estimated" />}
                {latest.isPartial && <Badge kind="partial">{`Partial: ${latest.daysObserved} days observed`}</Badge>}
                {!latest.isEstimated && !latest.isPartial && <span>Complete month, observed by VIIRS</span>}
              </>
            )
          }
        />
      </KpiDetail>
      <KpiDetail
        category="Seasonality"
        title="Busiest month of the year"
        evidence={seasonEvidence(months, baselineYears)}
        context={context}
      >
        <KpiTile
          opens
          variant="season"
          category="Seasonality"
          title="Busiest month of the year"
          value={busiest ? MONTHS_LONG[busiest.month - 1] : "No data"}
          comparison={busiest ? `Median ${formatCompact(busiest.median)} hotspots` : undefined}
          detail="Highest median of the twelve months"
          footer={`Reference period ${baseline}`}
        />
      </KpiDetail>
      <KpiDetail
        category="Year to date"
        title={ytd ? `${ytd.year} so far` : "Year so far"}
        evidence={ytdEvidence(months)}
        context={context}
      >
        <KpiTile
          opens
          variant="year"
          category="Year to date"
          title={ytd ? `${ytd.year} so far` : "Year so far"}
          value={formatCompact(ytd?.value)}
          comparison={ytd ? delta(ytd.value, ytd.median, `the sum of ${ytd.months} monthly medians`) : undefined}
          detail="VIIRS-equivalent hotspots, complete months only"
          footer={ytd ? (ytd.partial ? "Partial month left out" : `${ytd.months} complete months`) : undefined}
        />
      </KpiDetail>
      <KpiDetail
        category="Data provenance"
        title="Months estimated from MODIS"
        evidence={provenanceEvidence(months, startYear, endYear)}
        context={context}
      >
        <KpiTile
          opens
          variant="provenance"
          category="Data provenance"
          title="Months estimated from MODIS"
          value={`${share.estimated} of ${share.total}`}
          comparison={
            share.total > 0 ? `${Math.round((100 * share.estimated) / share.total)}% of the months shown` : undefined
          }
          detail={`In ${startYear}–${endYear}`}
          footer="Observed by VIIRS from February 2012"
        />
      </KpiDetail>
    </section>
  );
}
