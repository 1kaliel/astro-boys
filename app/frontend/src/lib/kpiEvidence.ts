import type { CalendarMonth } from "../data/calendarSource";
import { busiestMonth, inYears, latestComparison, yearToDate } from "./metrics";

/**
 * The records behind each of the four cards: exactly the months and rules the figure was computed from, so the panel
 * can show them and nobody has to take the number on trust. Pure: the same functions as the cards feed from.
 */
export type EvidenceRow = {
  label: string;
  /** Hotspot detections (VIIRS-equivalent), or null when there is no estimate. */
  value: number | null;
  /** The reference the value is compared with (median), when it has one. */
  reference: number | null;
  note: string;
};

export type Evidence = {
  /** The exact figure, unrounded, and its unit. */
  exact: string;
  unit: string;
  rule: string;
  rows: EvidenceRow[];
  /** What was left out and why. */
  excluded: string[];
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const SENSOR: Record<string, string> = {
  Aqua: "Aqua MODIS",
  Terra: "Terra MODIS",
  SNPP: "S-NPP VIIRS",
  N20: "NOAA-20 VIIRS",
};

export const origin = (m: CalendarMonth): string =>
  `${m.isEstimated ? "Estimated from MODIS" : "Observed by VIIRS"}${m.sourceSatellite ? ` (${SENSOR[m.sourceSatellite] ?? m.sourceSatellite})` : ""}`;

/** An exact figure: all the digits that matter (two decimals at most), never floating-point noise. */
const num = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const label = (m: CalendarMonth) => `${MONTHS[m.month - 1]} ${m.year}`;

export function activityEvidence(
  months: readonly CalendarMonth[],
  baseline: readonly [number, number] | null,
): Evidence | null {
  const latest = months.at(-1);
  if (!latest) return null;
  const cmp = latestComparison(latest);
  const rule =
    cmp.kind === "same_days"
      ? `The month is not complete, so it is compared with the median of the same ${cmp.days} days (days 1 to ${cmp.days}) of ${cmp.years} earlier years.`
      : cmp.kind === "none"
        ? "The month is not complete and has no same-days history, so it is not compared with full months."
        : `Compared with the median of ${MONTHS[latest.month - 1]} in earlier years${baseline ? ` (${baseline[0]}–${baseline[1]})` : ""}.`;
  return {
    exact: latest.count === null ? "No estimate" : num(latest.count),
    unit: "VIIRS-equivalent hotspot detections in the month",
    rule,
    rows: [
      {
        label: label(latest),
        value: latest.count,
        reference: latest.medianHist,
        note: `${latest.daysObserved} days observed. ${origin(latest)}.${latest.ciLow !== null && latest.isEstimated ? ` 90% interval ${num(latest.ciLow)} to ${num(latest.ciHigh ?? latest.ciLow)}.` : ""}`,
      },
    ],
    excluded: latest.isPartial
      ? [`${label(latest)} is partial (${latest.daysObserved} days observed): the count is not a full month.`]
      : [],
  };
}

export function seasonEvidence(
  months: readonly CalendarMonth[],
  baseline: readonly [number, number] | null,
): Evidence | null {
  const best = busiestMonth(months);
  if (!best) return null;
  const medians = new Map<number, number>();
  for (const m of months) if (!m.isPartial && m.medianHist != null) medians.set(m.month, m.medianHist);
  return {
    exact: `${MONTHS[best.month - 1]}, median ${num(best.median)}`,
    unit: "Median monthly VIIRS-equivalent hotspot detections",
    rule: `The busiest month is the one of the twelve with the highest median over the reference years${baseline ? ` ${baseline[0]}–${baseline[1]}` : ""}. Partial months are not in the median.`,
    rows: [...medians.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([month, median]) => ({
        label: MONTHS[month - 1],
        value: median,
        reference: null,
        note: month === best.month ? "Highest median" : "",
      })),
    excluded: [],
  };
}

export function ytdEvidence(months: readonly CalendarMonth[]): Evidence | null {
  const ytd = yearToDate(months);
  const last = months.at(-1);
  if (!ytd || !last) return null;
  const all = months.filter((m) => m.year === last.year);
  const complete = all.filter((m) => !m.isPartial);
  return {
    exact: `${num(ytd.value)} against ${num(ytd.median)}`,
    unit: "VIIRS-equivalent hotspot detections, complete months of the latest year",
    rule: "Sum of the complete months of the latest year, against the sum of their monthly medians. Partial months are left out of both.",
    rows: complete.map((m) => ({ label: label(m), value: m.count, reference: m.medianHist, note: origin(m) })),
    excluded: all
      .filter((m) => m.isPartial)
      .map((m) => `${label(m)} is partial (${m.daysObserved} days observed): not in the sum.`),
  };
}

export function provenanceEvidence(months: readonly CalendarMonth[], startYear: number, endYear: number): Evidence {
  const shown = inYears(months, startYear, endYear);
  const est = shown.filter((m) => m.isEstimated);
  return {
    exact: `${est.length} of ${shown.length} months`,
    unit: "Months of the years shown that are estimated from MODIS",
    rule: "A month before February 2012 is built from MODIS and carries an interval; from February 2012 it is observed by VIIRS.",
    rows: shown.map((m) => ({ label: label(m), value: m.count, reference: null, note: origin(m) })),
    excluded: [],
  };
}

/** The rows as CSV, with the unit in the header: the same records the panel shows. */
export function evidenceCsv(e: Evidence): string {
  const q = (t: string) => `"${t.replace(/"/g, '""')}"`;
  return [
    "month,value,reference_median,note",
    ...e.rows.map((r) => [q(r.label), r.value ?? "", r.reference ?? "", q(r.note)].join(",")),
  ].join("\n");
}
