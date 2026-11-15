import { Badge } from "../../components/ui/Badge";
import { KpiTile } from "../../components/viz/KpiTile";
import type { CalendarMonth } from "../../data/calendarSource";
import { formatCompact, formatCount, MONTHS_LONG } from "../../lib/format";
import { busiestMonth, estimatedShare, inYears, percentChange, yearToDate } from "../../lib/metrics";

type KpiRowProps = {
  /** The whole series of the area (not cut to the year range): "latest" means the latest month in the data. */
  months: readonly CalendarMonth[];
  startYear: number;
  endYear: number;
  /** Years the median is computed over; null when there is no complete month. */
  baselineYears: readonly [number, number] | null;
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

export function KpiRow({ months, startYear, endYear, baselineYears }: KpiRowProps) {
  const latest = months.at(-1) ?? null;
  const busiest = busiestMonth(months);
  const ytd = yearToDate(months);
  const share = estimatedShare(inYears(months, startYear, endYear));
  const baseline = baselineYears ? `${baselineYears[0]}–${baselineYears[1]}` : "the baseline";
  const monthName = latest ? MONTHS_LONG[latest.month - 1] : "";

  return (
    <section className="kpi-row" aria-label="Key figures for the selected area">
      <KpiTile
        hero
        label={latest ? `${monthName} ${latest.year}${latest.isPartial ? " so far" : ""}` : "Latest month"}
        value={formatCompact(latest?.count)}
        detail={
          latest
            ? latest.isPartial
              ? // A partial month is never compared with full months: it would read as "little activity".
                `VIIRS-equivalent hotspots · partial month, not compared with the ${monthName} median`
              : `VIIRS-equivalent hotspots · ${delta(latest.count, latest.medianHist, `the ${monthName} median`)}`
            : "No data"
        }
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
        value={busiest ? MONTHS_LONG[busiest.month - 1] : "No data"}
        detail={busiest ? `Median ${formatCompact(busiest.median)} hotspots, ${baseline}` : undefined}
      />
      <KpiTile
        label={ytd ? `${ytd.year} so far` : "Year so far"}
        value={formatCompact(ytd?.value)}
        detail={
          ytd
            ? `${delta(ytd.value, ytd.median, `the sum of ${ytd.months} monthly medians`)}${
                ytd.partial ? " · partial month left out" : ""
              }`
            : undefined
        }
      />
      <KpiTile
        label="Months estimated from MODIS"
        value={`${share.estimated} of ${share.total}`}
        detail={`In ${startYear}–${endYear}. Observed by VIIRS from February 2012.`}
      />
    </section>
  );
}
