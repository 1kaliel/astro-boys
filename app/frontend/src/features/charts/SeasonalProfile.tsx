import { useMemo, useRef } from "react";
import { ChartTableTabs } from "../../components/ui/ChartTableTabs";
import { ImageDownload } from "../../components/ui/DownloadBar";
import { ExportMenu } from "../../components/ui/ExportMenu";
import type { CalendarMonth } from "../../data/calendarSource";
import { axisTicks, monthsOfYear, niceCeil, seasonalProfile } from "../../lib/charts";
import { areaText, exportFileName, periodText, SOURCE_TEXT, type ExportContext } from "../../lib/exportFile";
import { formatCompact, formatCount } from "../../lib/format";
import { monthLong, monthShort } from "../calendar/calendarText";
import { BASELINE_Y, CHART, INNER_WIDTH, bandPath, linePath, xOf, yOf, type Point } from "./svg";

export const SEASONAL_UNIT = "VIIRS-equivalent hotspot detections per month";

type SeasonalProfileProps = {
  /** Every month of the area and period (the whole series, not cut to the year range). */
  months: readonly CalendarMonth[];
  startYear: number;
  endYear: number;
  /** The year drawn over the band: the year of the month picked in the calendar, or the latest year. */
  year: number;
  /** Area, period and model version, written into the downloaded image. */
  exportContext: ExportContext;
};

/**
 * The typical year of the area (task D9): for each month of the year, the 10th to 90th percentile band and the
 * median of the years shown, with one year drawn over it. Estimated months of that year carry their 90% interval
 * as error bars; a partial month is a hollow point and is never read as "little activity".
 */
export function SeasonalProfile({ months, startYear, endYear, year, exportContext }: SeasonalProfileProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const profile = useMemo(() => seasonalProfile(months, startYear, endYear), [months, startYear, endYear]);
  const yearMonths = useMemo(() => monthsOfYear(months, year), [months, year]);

  const values = [
    ...profile.flatMap((p) => (p.p90 === null ? [] : [p.p90])),
    ...yearMonths.flatMap((m) => (m && m.count !== null ? [m.ciHigh ?? m.count, m.count] : [])),
  ];
  if (values.length === 0) {
    return (
      <p className="chart-status" role="status">
        No hotspot data for a seasonal profile in this selection.
      </p>
    );
  }

  const max = niceCeil(Math.max(...values));
  const x = (month: number) => xOf(month - 1, 12);
  const banded = profile.filter((p) => p.p10 !== null && p.p90 !== null);
  const upper: Point[] = banded.map((p) => ({ x: x(p.month), y: yOf(p.p90 as number, max) }));
  const lower: Point[] = banded.map((p) => ({ x: x(p.month), y: yOf(p.p10 as number, max) }));
  const medianLine = profile.map((p) => (p.median === null ? null : { x: x(p.month), y: yOf(p.median, max) }));
  const yearLine = yearMonths.map((m) => (m && m.count !== null ? { x: x(m.month), y: yOf(m.count, max) } : null));
  const bandYears = Math.max(0, ...profile.map((p) => p.years));
  const hasEstimated = yearMonths.some((m) => m?.isEstimated && m.ciLow !== null && m.ciHigh !== null);
  const hasPartial = yearMonths.some((m) => m?.isPartial && m.count !== null);

  const exportMeta = {
    title: `Seasonal profile: ${year} against ${startYear}-${endYear}`,
    unit: SEASONAL_UNIT,
    series: `Harmonized series (VIIRS-equivalent); months before February 2012 are estimated from MODIS.`,
    area: areaText(exportContext.area),
    period: periodText(startYear, endYear, exportContext.period),
    modelVersion: exportContext.modelVersion,
    source: SOURCE_TEXT,
    legend: [
      `Shaded band: 10th to 90th percentile of complete months, ${startYear}-${endYear}. Dashed line: median. Solid line: ${year}.`,
      ...(hasEstimated ? ["Vertical bars: 90% interval of months estimated from MODIS."] : []),
      ...(hasPartial ? ["Hollow point: partial month, not comparable with the band."] : []),
    ],
  };

  const chart = (
    <>
    <div className="chart-scroll">
      <svg
        className="line-chart"
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        aria-label={`Seasonal profile: ${SEASONAL_UNIT}. Band from the 10th to the 90th percentile and median of ${startYear} to ${endYear}, with ${year} drawn over it. The table view has the numbers.`}
      >
        {axisTicks(max).map((tick) => (
          <g key={tick}>
            <line className="chart-grid" x1={CHART.left} x2={CHART.left + INNER_WIDTH} y1={yOf(tick, max)} y2={yOf(tick, max)} />
            <text className="chart-tick" x={CHART.left - 8} y={yOf(tick, max)} textAnchor="end" dominantBaseline="central">
              {formatCompact(tick)}
            </text>
          </g>
        ))}
        {profile.map((p) => (
          <text key={p.month} className="chart-tick chart-tick-x" x={x(p.month)} y={BASELINE_Y + 18} textAnchor="middle">
            {monthShort(p.month)}
          </text>
        ))}
        <path className="chart-band" d={bandPath(upper, lower)} />
        <path className="chart-line chart-line-median" d={linePath(medianLine)} />
        <g className="chart-series chart-series-year">
          <path className="chart-line" d={linePath(yearLine)} />
          {yearMonths.map((m) => {
            if (!m || m.count === null) return null;
            const cx = x(m.month);
            const interval = m.isEstimated && m.ciLow !== null && m.ciHigh !== null;
            return (
              <g key={m.month}>
                {interval && (
                  <path
                    className="chart-errorbar"
                    d={`M${cx - 4},${yOf(m.ciHigh as number, max)}h8M${cx},${yOf(m.ciHigh as number, max)}V${yOf(m.ciLow as number, max)}M${cx - 4},${yOf(m.ciLow as number, max)}h8`}
                  />
                )}
                <circle
                  className={m.isPartial ? "chart-point chart-point-estimated" : "chart-point"}
                  cx={cx}
                  cy={yOf(m.count, max)}
                  r={3.5}
                >
                  <title>
                    {`${monthLong(m.month)} ${year}: ${formatCount(m.count)}${
                      interval ? `, 90% interval ${formatCount(m.ciLow)} to ${formatCount(m.ciHigh)}` : ""
                    }${m.isEstimated ? " · estimated from MODIS" : ""}${
                      m.isPartial ? ` · partial month, ${m.daysObserved} days observed` : ""
                    }`}
                  </title>
                </circle>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
    </>
  );

  const table = (
    <div className="calendar-table-wrap" role="region" aria-label="Seasonal profile, table view" tabIndex={0}>
      <table className="calendar-table">
        <caption className="calendar-table-caption">
          {SEASONAL_UNIT}, {startYear}–{endYear} and {year}
        </caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">10th percentile</th>
            <th scope="col">Median</th>
            <th scope="col">90th percentile</th>
            <th scope="col">Years</th>
            <th scope="col">{year}</th>
          </tr>
        </thead>
        <tbody>
          {profile.map((p, index) => {
            const m = yearMonths[index];
            return (
              <tr key={p.month}>
                <th scope="row">{monthShort(p.month)}</th>
                <td>{formatCount(p.p10)}</td>
                <td>{formatCount(p.median)}</td>
                <td>{formatCount(p.p90)}</td>
                <td>{p.years}</td>
                <td>
                  {m ? (m.count === null ? "No estimate" : formatCount(m.count)) : "No data"}
                  {m?.isEstimated ? " est." : ""}
                  {m?.isPartial ? " partial" : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="calendar-table-note">
        The band uses complete months only. est. = estimated from MODIS, partial = month not complete.
      </p>
    </div>
  );

  return (
    <div className="chart-block" ref={rootRef}>
      <ul className="chart-legend" aria-label="Marks">
        <li>
          <span className="chart-swatch chart-swatch-band" aria-hidden="true" />
          <span>
            <strong>Usual range</strong> · 10th to 90th percentile, {startYear}–{endYear} ({bandYears} years)
          </span>
        </li>
        <li>
          <svg className="chart-swatch" viewBox="0 0 28 10" aria-hidden="true">
            <line className="chart-line chart-line-median" x1={1} x2={27} y1={5} y2={5} />
          </svg>
          <span>
            <strong>Median</strong>
          </span>
        </li>
        <li>
          <svg className="chart-swatch chart-series-year" viewBox="0 0 28 10" aria-hidden="true">
            <line className="chart-line" x1={1} x2={27} y1={5} y2={5} />
          </svg>
          <span>
            <strong>{year}</strong> · pick a month in the calendar to change the year
          </span>
        </li>
      </ul>
      <ChartTableTabs
        label="Seasonal profile"
        chart={chart}
        table={table}
        actions={
          <ExportMenu label="Export the seasonal profile">
            <ImageDownload
              meta={exportMeta}
              fileName={(ext) => exportFileName("seasonal-profile", [year, `${startYear}-${endYear}`, exportContext.period], ext)}
              svgSelector="svg.line-chart"
              findSvg={() => rootRef.current?.querySelector<SVGSVGElement>("svg.line-chart") ?? null}
            />
          </ExportMenu>
        }
      />
      <p className="chart-note">
        {hasEstimated && "Vertical bars: 90% interval of the months estimated from MODIS. "}
        {hasPartial && "Hollow point: a partial month, not comparable with the full months of the band. "}
        The band is where 8 of every 10 years fall; a month outside it was unusual, which is not a forecast.
      </p>
    </div>
  );
}
