import { axisTicks, niceCeil } from "../../lib/charts";
import { formatCompact, formatCount, formatLegendCount } from "../../lib/format";
import { SENSOR_CHANGE_YEAR, type YearTotals } from "./landingData";

/** Two drawings of the same chart: a wide one, and a compact one for phones, so the type stays readable. */
const LAYOUTS = {
  wide: { W: 760, H: 340, M: { top: 28, right: 132, bottom: 34, left: 52 }, years: 8 },
  compact: { W: 360, H: 300, M: { top: 30, right: 84, bottom: 30, left: 38 }, years: 4 },
} as const;

/**
 * Yearly totals, raw against harmonized. Raw is the archive read as one record: Aqua MODIS until 2011 (orange, the
 * explorer's Aqua color), S-NPP VIIRS from 2012 (aqua green); the step between them is dashed, because it is the
 * change of satellite, not a change on the ground. Harmonized is the VIIRS-equivalent series (blue).
 */
export function JumpChart({ rows, compact = false }: { rows: readonly YearTotals[]; compact?: boolean }) {
  if (rows.length < 2) return null;
  const { W, H, M, years } = LAYOUTS[compact ? "compact" : "wide"];
  const IW = W - M.left - M.right;
  const IH = H - M.top - M.bottom;
  const first = rows[0].year;
  const last = rows[rows.length - 1].year;
  const max = niceCeil(Math.max(...rows.flatMap((r) => [r.raw, r.harmonized])));
  const x = (year: number) => M.left + ((year - first) / Math.max(1, last - first)) * IW;
  const y = (value: number) => M.top + IH - (value / max) * IH;
  const path = (list: readonly YearTotals[], pick: (r: YearTotals) => number) =>
    list.map((r, i) => `${i === 0 ? "M" : "L"}${x(r.year).toFixed(1)},${y(pick(r)).toFixed(1)}`).join("");

  const modis = rows.filter((r) => r.year < SENSOR_CHANGE_YEAR);
  const viirs = rows.filter((r) => r.year >= SENSOR_CHANGE_YEAR);
  const before = modis.at(-1);
  const after = viirs[0];
  const changeX = before && after ? (x(before.year) + x(after.year)) / 2 : null;
  const lastRow = rows[rows.length - 1];
  const labelEvery = Math.ceil(rows.length / years);

  // Direct labels at the right end, nudged apart when the two series end close together.
  let harmonizedY = y(lastRow.harmonized);
  let viirsY = y(lastRow.raw);
  if (Math.abs(harmonizedY - viirsY) < 30) {
    const mid = (harmonizedY + viirsY) / 2;
    const up = lastRow.harmonized >= lastRow.raw;
    harmonizedY = mid + (up ? -15 : 15);
    viirsY = mid + (up ? 15 : -15);
  }

  return (
    <svg className={compact ? "jump-chart is-compact" : "jump-chart"} viewBox={`0 0 ${W} ${H}`} role="presentation" aria-hidden="true" focusable="false">
      {axisTicks(max, 4).map((tick) => (
        <g key={tick}>
          <line className="jump-grid" x1={M.left} x2={M.left + IW} y1={y(tick)} y2={y(tick)} />
          <text className="jump-axis" x={M.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
            {tick === 0 ? "0" : formatCompact(tick)}
          </text>
        </g>
      ))}
      {rows.map((r, i) =>
        (i % labelEvery === 0 && last - r.year >= labelEvery) || r.year === last ? (
          <text key={r.year} className="jump-axis" x={x(r.year)} y={H - 10} textAnchor="middle">
            {r.year}
          </text>
        ) : null,
      )}
      {changeX != null && (
        <g>
          <line className="jump-change" x1={changeX} x2={changeX} y1={M.top - 14} y2={M.top + IH} />
          <text className="jump-note" x={changeX + 6} y={M.top - 4}>
            Satellite changes
          </text>
        </g>
      )}

      <path className="jump-line jump-harmonized" d={path(rows, (r) => r.harmonized)} />
      <path className="jump-line jump-modis" d={path(modis, (r) => r.raw)} />
      <path className="jump-line jump-viirs" d={path(viirs, (r) => r.raw)} />
      {before && after && (
        <>
          <path className="jump-line jump-step" d={`M${x(before.year)},${y(before.raw)}L${x(after.year)},${y(after.raw)}`} />
          <circle className="jump-dot jump-dot-modis" cx={x(before.year)} cy={y(before.raw)} r={4} />
          <circle className="jump-dot jump-dot-viirs" cx={x(after.year)} cy={y(after.raw)} r={4} />
          <text className="jump-value" x={x(before.year) - 8} y={y(before.raw) + 16} textAnchor="end">
            {formatLegendCount(before.raw)}
          </text>
          <text className="jump-value" x={x(after.year) + 9} y={y(after.raw) - 6}>
            {formatLegendCount(after.raw)}
          </text>
        </>
      )}

      <text className="jump-label jump-label-harmonized" x={M.left + IW + 10} y={harmonizedY} dy="0.32em">
        Harmonized
      </text>
      <text className="jump-label jump-label-viirs" x={M.left + IW + 10} y={viirsY} dy="0.32em">
        Raw · VIIRS
      </text>
      {modis.length > 0 && (
        <text className="jump-label jump-label-modis" x={x(modis[0].year)} y={y(modis[0].raw) - 10}>
          {compact ? "Raw · MODIS" : "Raw · MODIS Aqua"}
        </text>
      )}
    </svg>
  );
}

/** The same numbers as a table, for screen readers. */
export function JumpTable({ rows }: { rows: readonly YearTotals[] }) {
  return (
    <div className="sr-only">
    <table>
      <caption>Hotspot detections per year in the study area, raw source count and harmonized (VIIRS-equivalent)</caption>
      <thead>
        <tr>
          <th scope="col">Year</th>
          <th scope="col">Raw source count (MODIS Aqua to {SENSOR_CHANGE_YEAR - 1}, VIIRS S-NPP from {SENSOR_CHANGE_YEAR})</th>
          <th scope="col">Harmonized</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.year}>
            <th scope="row">{r.year}</th>
            <td>{formatCount(r.raw)}</td>
            <td>{formatCount(Math.round(r.harmonized))}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

/**
 * Yearly totals of one harmonized series (the Brazil-wide experimental run), drawn like the jump chart: same axes,
 * same harmonized blue, the highest and the latest year labeled directly.
 */
export function TotalsChart({ rows, compact = false, label }: { rows: readonly { year: number; total: number }[]; compact?: boolean; label: string }) {
  if (rows.length < 2) return null;
  const { W, M, years } = LAYOUTS[compact ? "compact" : "wide"];
  const H = compact ? 240 : 280;
  const IW = W - M.left - M.right;
  const IH = H - M.top - M.bottom;
  const first = rows[0].year;
  const last = rows[rows.length - 1].year;
  const max = niceCeil(Math.max(...rows.map((r) => r.total)));
  const x = (year: number) => M.left + ((year - first) / Math.max(1, last - first)) * IW;
  const y = (value: number) => M.top + IH - (value / max) * IH;
  const d = rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(r.year).toFixed(1)},${y(r.total).toFixed(1)}`).join("");
  const peak = rows.reduce((best, r) => (r.total > best.total ? r : best), rows[0]);
  const end = rows[rows.length - 1];
  const labelEvery = Math.ceil(rows.length / years);
  return (
    <svg className={compact ? "jump-chart is-compact" : "jump-chart"} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      {axisTicks(max, 4).map((tick) => (
        <g key={tick}>
          <line className="jump-grid" x1={M.left} x2={M.left + IW} y1={y(tick)} y2={y(tick)} />
          <text className="jump-axis" x={M.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
            {tick === 0 ? "0" : formatCompact(tick)}
          </text>
        </g>
      ))}
      {rows.map((r, i) =>
        (i % labelEvery === 0 && last - r.year >= labelEvery) || r.year === last ? (
          <text key={r.year} className="jump-axis" x={x(r.year)} y={H - 10} textAnchor="middle">
            {r.year}
          </text>
        ) : null,
      )}
      <path className="jump-line jump-harmonized" d={d} />
      <circle className="jump-dot jump-dot-harmonized" cx={x(peak.year)} cy={y(peak.total)} r={4} />
      <text className="jump-value" x={x(peak.year)} y={y(peak.total) - 10} textAnchor="middle">
        {formatCompact(peak.total)}
      </text>
      <text className="jump-label jump-label-harmonized" x={M.left + IW + 10} y={y(end.total)} dy="0.32em">
        {label}
      </text>
    </svg>
  );
}
