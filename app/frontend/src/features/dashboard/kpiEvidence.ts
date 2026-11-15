import type { CalendarMonth } from "../../data/calendarSource";
import { areaText, periodText } from "../../lib/exportFile";
import { formatCount, MONTHS_LONG } from "../../lib/format";
import { hotspotsCsvUrl } from "../../lib/hotspotsCsv";
import type { Bounds, Period } from "../../state/dashboard";
import { provenanceText, sensorName } from "../calendar/calendarModel";

/** What the evidence panel of a KPI card shows: the figure, how it is made, the records behind it and the source. */
export type Evidence = {
  /** The exact figure (the card shows a compact one). */
  value: string;
  /** How the figure is computed, in words. */
  how: string;
  /** The records the figure is made of: the monthly rows of the calendar. */
  columns: string[];
  rows: string[][];
  source: EvidenceSource;
};

export type EvidenceSource = {
  provider: string;
  /** Satellites and instruments of the rows, e.g. "Aqua MODIS, S-NPP VIIRS". */
  instruments: string;
  area: string;
  period: string;
  modelVersion: string;
  /** The API call that returns these rows (JSON). */
  apiUrl: string;
  /** The native detections of the same area and years, as CSV (not harmonized); null when there is none to link. */
  csvUrl: string | null;
  csvLabel: string;
};

export type EvidenceContext = {
  area: Bounds;
  period: Period;
  modelVersion: string;
  startYear: number;
  endYear: number;
};

const monthLabel = (m: Pick<CalendarMonth, "year" | "month">) => `${MONTHS_LONG[m.month - 1]} ${m.year}`;
const countText = (value: number | null | undefined) => (value == null ? "No estimate" : formatCount(value));

function source(
  months: readonly CalendarMonth[],
  context: EvidenceContext,
  years: readonly [number, number] | null,
  csvLabel: string,
): EvidenceSource {
  const names = [...new Set(months.map((m) => m.sourceSatellite).filter((s): s is string => Boolean(s)))].map(
    sensorName,
  );
  const { west, south, east, north } = context.area;
  const api = new URLSearchParams({
    west: String(west),
    south: String(south),
    east: String(east),
    north: String(north),
    period: context.period,
  });
  return {
    provider: "NASA FIRMS (MODIS and VIIRS active fire products), harmonized to VIIRS-equivalent counts",
    instruments: names.length > 0 ? names.join(", ") : "MODIS and VIIRS",
    area: areaText(context.area),
    period: periodText(years?.[0] ?? context.startYear, years?.[1] ?? context.endYear, context.period),
    modelVersion: context.modelVersion,
    apiUrl: `/api/calendar?${api}`,
    csvUrl: years
      ? hotspotsCsvUrl({
          area: context.area,
          startYear: years[0],
          endYear: years[1],
          period: context.period,
          includeAll: false,
        })
      : null,
    csvLabel,
  };
}

const MONTH_COLUMNS = ["Month", "Detections", "Median", "Source", "State"];
const monthRow = (m: CalendarMonth): string[] => [
  monthLabel(m),
  countText(m.count),
  m.medianHist == null ? "–" : formatCount(m.medianHist),
  m.sourceSatellite ? sensorName(m.sourceSatellite) : "–",
  provenanceText(m),
];

/** The headline: the latest month, with the median it is compared with. */
export function latestEvidence(latest: CalendarMonth, context: EvidenceContext): Evidence {
  return {
    value: latest.count == null ? "No estimate for this month" : `${formatCount(latest.count)} detections`,
    how: latest.isPartial
      ? "Hotspot detections of the month so far, summed over every 0.25° cell of the area. The month is not complete, so it is compared only with the same days of earlier years."
      : "Hotspot detections of the month, summed over every 0.25° cell of the area, compared with the median of the same month in earlier years.",
    columns: MONTH_COLUMNS,
    rows: [monthRow(latest)],
    source: source([latest], context, [latest.year, latest.year], `Native detections of ${latest.year} (CSV)`),
  };
}

/** The month of the year with the highest median: the medians of the months of the year are the records. */
export function busiestEvidence(months: readonly CalendarMonth[], context: EvidenceContext): Evidence {
  const byMonth = new Map<number, CalendarMonth>();
  for (const m of months) if (!m.isPartial && m.medianHist != null) byMonth.set(m.month, m);
  const ordered = [...byMonth.values()].sort((a, b) => a.month - b.month);
  const best = [...ordered].sort((a, b) => (b.medianHist ?? 0) - (a.medianHist ?? 0))[0];
  return {
    value: best ? `${MONTHS_LONG[best.month - 1]}, median ${formatCount(best.medianHist ?? 0)} detections` : "No data",
    how: "Each month of the year has a median over the complete years of the baseline. The busiest month is the one with the highest median.",
    columns: ["Month of the year", "Median detections"],
    rows: ordered.map((m) => [MONTHS_LONG[m.month - 1], formatCount(m.medianHist ?? 0)]),
    source: source(ordered, context, null, ""),
  };
}

/** The latest year so far: the complete months and the sum of their medians. */
export function yearToDateEvidence(months: readonly CalendarMonth[], context: EvidenceContext): Evidence | null {
  const last = months.at(-1);
  if (!last) return null;
  const rows = months.filter((m) => m.year === last.year && !m.isPartial);
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, m) => sum + (m.count ?? 0), 0);
  return {
    value: `${formatCount(total)} detections in ${rows.length} complete months`,
    how: "Sum of the complete months of the latest year. The partial month is left out, and the comparison is the sum of the monthly medians of the same months.",
    columns: MONTH_COLUMNS,
    rows: rows.map(monthRow),
    source: source(rows, context, [last.year, last.year], `Native detections of ${last.year} (CSV)`),
  };
}

/** How many months of the selected years are estimated from MODIS, one row per year. */
export function estimatedEvidence(months: readonly CalendarMonth[], context: EvidenceContext): Evidence {
  // The whole record, like the card: the years on screen do not change this count.
  const inRange = months;
  const firstYear = months[0]?.year ?? context.startYear;
  const lastYear = months.at(-1)?.year ?? context.endYear;
  const perYear = new Map<number, { estimated: number; observed: number }>();
  for (const m of inRange) {
    const row = perYear.get(m.year) ?? { estimated: 0, observed: 0 };
    if (m.isEstimated) row.estimated += 1;
    else row.observed += 1;
    perYear.set(m.year, row);
  }
  const estimated = inRange.filter((m) => m.isEstimated).length;
  return {
    value: `${estimated} of ${inRange.length} months estimated`,
    how: "Before February 2012 there was no VIIRS, so those months are estimated from MODIS counts. From February 2012 the counts are observed by VIIRS.",
    columns: ["Year", "Estimated from MODIS", "Observed by VIIRS"],
    rows: [...perYear.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, n]) => [String(year), String(n.estimated), String(n.observed)]),
    source: source(inRange, context, [firstYear, lastYear], `Native detections ${firstYear}–${lastYear} (CSV)`),
  };
}

const inRange = (months: readonly CalendarMonth[], context: EvidenceContext) =>
  months.filter((m) => m.year >= context.startYear && m.year <= context.endYear);

/** KPI 1: every month of the selected years with its count. */
export function totalEvidence(months: readonly CalendarMonth[], context: EvidenceContext): Evidence {
  const rows = inRange(months, context);
  const total = rows.reduce((sum, m) => sum + (m.count ?? 0), 0);
  return {
    value: `${formatCount(total)} VIIRS-equivalent detections, ${context.startYear}–${context.endYear}`,
    how: "Sum of the monthly hotspot detections of the area over the selected years. Months before February 2012 are estimated from MODIS; months without an estimate are left out, never counted as zero. The comparison uses only complete months, against the sum of their medians.",
    columns: MONTH_COLUMNS,
    rows: rows.map(monthRow),
    source: source(
      rows,
      context,
      [context.startYear, context.endYear],
      `Native detections ${context.startYear}–${context.endYear} (CSV)`,
    ),
  };
}

/** KPI 2: the month of the selected years with the most detections, and the next nine. */
export function peakEvidence(months: readonly CalendarMonth[], context: EvidenceContext): Evidence {
  const ranked = inRange(months, context)
    .filter((m) => m.count != null)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 10);
  const best = ranked[0];
  return {
    value: best ? `${monthLabel(best)}: ${formatCount(best.count ?? 0)} detections` : "No data",
    how: "The single month of the selected years with the highest count. The table lists the ten highest.",
    columns: MONTH_COLUMNS,
    rows: ranked.map(monthRow),
    source: source(ranked, context, best ? [best.year, best.year] : null, best ? `Native detections of ${best.year} (CSV)` : ""),
  };
}

/** KPI 3: the complete months above the median of their month of the year, with the robust z. */
export function aboveEvidence(months: readonly CalendarMonth[], context: EvidenceContext): Evidence {
  const rows = inRange(months, context).filter(
    (m) => !m.isPartial && m.count != null && m.medianHist != null && m.count > m.medianHist,
  );
  return {
    value: `${rows.length} months above the usual level`,
    how: "A complete month is above usual when its count is above the median of the same month of the year over the baseline years. It is unusually high when its robust z-score, (count − median) / (1.4826 × MAD), is 2 or more. These are product thresholds, not NASA ones, and not a risk level. Partial months are not judged.",
    columns: [...MONTH_COLUMNS, "Robust z"],
    rows: rows.map((m) => [...monthRow(m), m.anomalyZ == null ? "–" : m.anomalyZ.toFixed(1)]),
    source: source(rows, context, [context.startYear, context.endYear], `Native detections ${context.startYear}–${context.endYear} (CSV)`),
  };
}
