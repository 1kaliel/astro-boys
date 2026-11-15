import { useMemo } from "react";
import { ChartTableTabs } from "../../components/ui/ChartTableTabs";
import type { CalendarMonth } from "../../data/calendarSource";
import { annualTotals, axisTicks, niceCeil, type AnnualTotals } from "../../lib/charts";
import { formatCompact, formatCount } from "../../lib/format";
import { BASELINE_Y, CHART, INNER_WIDTH, linePath, xOf, yOf, type Point } from "./svg";

export const TREND_UNIT = "hotspot detections per year (complete years only)";

type SeriesKey = "harmonized" | "rawAqua" | "rawSnpp";

const SERIES: ReadonlyArray<{ key: SeriesKey; label: string; note: string }> = [
  { key: "harmonized", label: "Harmonized", note: "VIIRS-equivalent, the series this dashboard uses" },
  { key: "rawAqua", label: "Aqua MODIS, raw", note: "native count, not harmonized" },
  { key: "rawSnpp", label: "S-NPP VIIRS, raw", note: "native count, from February 2012" },
];

type TrendChartProps = {
  /** Every month of the area and period (the whole series, not cut to the year range). */
  months: readonly CalendarMonth[];
  startYear: number;
  endYear: number;
};

/**
 * Yearly totals: the harmonized series next to the raw counts of each sensor (task D9). Read raw, the record
 * seems to jump when VIIRS replaces MODIS in 2012; harmonized, the years before and after are comparable.
 * Raw counts of different satellites are drawn as separate lines and never added together.
 */
export function TrendChart({ months, startYear, endYear }: TrendChartProps) {
  const rows = useMemo(
    () => annualTotals(months).filter((row) => row.year >= startYear && row.year <= endYear),
    [months, startYear, endYear],
  );
  const values = rows.flatMap((row) => SERIES.flatMap((s) => (row[s.key] === null ? [] : [row[s.key] as number])));

  if (rows.length < 2 || values.length === 0) {
    return (
      <p className="chart-status" role="status">
        Not enough complete years in this range for a trend. Widen the range of years.
      </p>
    );
  }

  const max = niceCeil(Math.max(...values));
  const pointOf = (row: AnnualTotals, index: number, key: SeriesKey): Point | null => {
    const value = row[key];
    return value === null ? null : { x: xOf(index, rows.length), y: yOf(value, max) };
  };
  // A year label every few years, so the labels never touch.
  const labelEvery = Math.ceil(rows.length / 9);
  const firstViirs = rows.findIndex((row) => row.year >= 2012);
  const sensorChangeX =
    firstViirs > 0 ? (xOf(firstViirs - 1, rows.length) + xOf(firstViirs, rows.length)) / 2 : null;

  const chart = (
    <div className="chart-scroll">
      <svg
        className="line-chart"
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        aria-label={`Trend: ${TREND_UNIT}, ${rows[0].year} to ${rows[rows.length - 1].year}. Harmonized series and raw counts of Aqua MODIS and S-NPP VIIRS. The table view has the numbers.`}
      >
        {axisTicks(max).map((tick) => (
          <g key={tick}>
            <line className="chart-grid" x1={CHART.left} x2={CHART.left + INNER_WIDTH} y1={yOf(tick, max)} y2={yOf(tick, max)} />
            <text className="chart-tick" x={CHART.left - 8} y={yOf(tick, max)} textAnchor="end" dominantBaseline="central">
              {formatCompact(tick)}
            </text>
          </g>
        ))}
        {rows.map((row, index) =>
          index % labelEvery === 0 ? (
            <text key={row.year} className="chart-tick" x={xOf(index, rows.length)} y={BASELINE_Y + 18} textAnchor="middle">
              {row.year}
            </text>
          ) : null,
        )}
        {sensorChangeX !== null && (
          <g>
            <line className="chart-marker" x1={sensorChangeX} x2={sensorChangeX} y1={CHART.top} y2={BASELINE_Y} />
            <text className="chart-marker-label" x={sensorChangeX + 6} y={CHART.top + 10}>
              VIIRS starts (Feb 2012)
            </text>
          </g>
        )}
        {/* Raw lines first, the harmonized line on top: after 2012 it equals the S-NPP count. */}
        {[...SERIES].reverse().map((series) => (
          <g key={series.key} className={`chart-series chart-series-${series.key}`}>
            <path className="chart-line" d={linePath(rows.map((row, index) => pointOf(row, index, series.key)))} />
            {rows.map((row, index) => {
              const point = pointOf(row, index, series.key);
              if (!point) return null;
              const estimated = series.key === "harmonized" && row.estimatedMonths > 0;
              return (
                <circle
                  key={row.year}
                  className={estimated ? "chart-point chart-point-estimated" : "chart-point"}
                  cx={point.x}
                  cy={point.y}
                  r={3}
                >
                  <title>
                    {`${row.year} · ${series.label}: ${formatCount(row[series.key])}${
                      estimated ? ` (${row.estimatedMonths} months estimated from MODIS)` : ""
                    }`}
                  </title>
                </circle>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );

  const table = (
    <div className="calendar-table-wrap" role="region" aria-label="Trend, table view" tabIndex={0}>
      <table className="calendar-table">
        <caption className="calendar-table-caption">{TREND_UNIT}</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Harmonized</th>
            <th scope="col">Months estimated</th>
            <th scope="col">Aqua MODIS, raw</th>
            <th scope="col">S-NPP VIIRS, raw</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.year}>
              <th scope="row">{row.year}</th>
              <td>{row.harmonized === null ? "Incomplete year" : formatCount(row.harmonized)}</td>
              <td>{row.estimatedMonths}</td>
              <td>{formatCount(row.rawAqua)}</td>
              <td>{formatCount(row.rawSnpp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="calendar-table-note">
        A year has a total only when its twelve months are complete. Raw counts of different satellites are not added.
      </p>
    </div>
  );

  return (
    <div className="chart-block">
      <ul className="chart-legend" aria-label="Lines">
        {SERIES.map((series) => (
          <li key={series.key}>
            <svg className={`chart-swatch chart-series-${series.key}`} viewBox="0 0 28 10" aria-hidden="true">
              <line className="chart-line" x1={1} x2={27} y1={5} y2={5} />
            </svg>
            <span>
              <strong>{series.label}</strong> · {series.note}
            </span>
          </li>
        ))}
        <li>
          <svg className="chart-swatch chart-series-harmonized" viewBox="0 0 28 10" aria-hidden="true">
            <circle className="chart-point chart-point-estimated" cx={14} cy={5} r={3} />
          </svg>
          <span>Hollow point: a year with months estimated from MODIS</span>
        </li>
      </ul>
      <ChartTableTabs label="Trend" chart={chart} table={table} />
      <p className="chart-note">
        Read raw, the record seems to jump when VIIRS replaces MODIS in 2012: VIIRS detects several times more hotspots
        than MODIS over the same fires. That step is the change of instrument, not a change in fire activity. The
        harmonized line puts the MODIS years on the VIIRS scale.
      </p>
    </div>
  );
}
