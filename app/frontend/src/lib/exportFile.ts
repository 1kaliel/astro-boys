import type { Bounds, Period } from "../state/dashboard";

/** What every downloaded file says about itself: the rule "sensor, period, unit and source on every chart". */
export type ExportMeta = {
  title: string;
  unit: string;
  /** "Series" line: harmonized or raw by sensor, or the lines of a chart. */
  series: string;
  area: string;
  period: string;
  modelVersion: string;
  source: string;
  /** Extra lines under the title in an image: how to read the marks. */
  legend?: readonly string[];
};

/** What a chart needs from the page to describe itself in a file: the area, the model version and the time of day. */
export type ExportContext = { area: Bounds; modelVersion: string; period: Period };

export const SOURCE_TEXT = "NASA FIRMS (MODIS and VIIRS active fire products)";
export const NOT_FIRES_TEXT = "Hotspots are satellite thermal detections: not confirmed fires and not burned area.";

const PERIOD_TEXT: Record<Period, string> = { ALL: "day and night", D: "day only", N: "night only" };

/** "-48.8 to -34.7 longitude, -18.4 to -1 latitude (0.25 degree cells inside)" */
export function areaText(area: Bounds): string {
  const lon = `${area.west} to ${area.east} longitude`;
  const lat = `${area.south} to ${area.north} latitude`;
  return `${lon}, ${lat} (0.25 degree cells inside)`;
}

/** "2002-2026, day and night" */
export function periodText(startYear: number, endYear: number, period: Period): string {
  const years = startYear === endYear ? `${startYear}` : `${startYear}-${endYear}`;
  return `${years}, ${PERIOD_TEXT[period]}`;
}

/** One CSV field: quoted when it holds a comma, a quote or a line break. */
export function csvField(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A comment row of the CSV: starts with "#", no commas, so readers that skip "#" rows never split it. */
function commentRow(label: string, value: string): string {
  return `# ${label}: ${value.replace(/,/g, ";").replace(/[\r\n]+/g, " ")}`;
}

export type CalendarCsvCell = {
  month: number;
  label: string;
  /** Null = no data or no estimate: an empty field, never 0. */
  count: number | null;
  /** 90% interval (estimated months; equal to `count` when observed). Null = none: an empty field. */
  ciLow: number | null;
  ciHigh: number | null;
  estimated: boolean;
  partial: boolean;
  /** Satellite the number comes from (`Aqua`, `SNPP`, `N20`). Null = unknown or no data. */
  sourceSatellite: string | null;
  /** False when the month has no row at all (outside the data): its flags are empty, not "false". */
  hasData: boolean;
};
export type CalendarCsvRow = { year: number; cells: readonly CalendarCsvCell[] };

/** What every data row of the calendar CSV repeats, so a row keeps its provenance when the file is cut or merged. */
export type CalendarCsvContext = {
  /** `harmonized` or `raw_by_sensor`. */
  series: string;
  /** `ALL`, `D` or `N`. */
  timeOfDay: Period;
  modelVersion: string;
  /** True when the intervals of an area sum are approximate (correlated errors of nearby cells). */
  intervalApproximate: boolean;
};

export const CALENDAR_CSV_COLUMNS = [
  "year",
  "month",
  "count",
  "ci90_low",
  "ci90_high",
  "is_estimated",
  "is_partial",
  "source_satellite",
  "series",
  "time_of_day",
  "model_version",
] as const;

/** Month indexes (year * 12 + month - 1) as runs: "2003-01 to 2012-01 2013-05". */
function monthRuns(indexes: readonly number[]): string {
  const label = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
  const runs: string[] = [];
  for (let i = 0; i < indexes.length; ) {
    let j = i;
    while (j + 1 < indexes.length && indexes[j + 1] === indexes[j] + 1) j += 1;
    runs.push(j - i >= 2 ? `${label(indexes[i])} to ${label(indexes[j])}` : indexes.slice(i, j + 1).map(label).join(" "));
    i = j + 1;
  }
  return runs.join(" ");
}

const round = (value: number | null) => (value === null ? null : Math.round(value));
const flag = (cell: CalendarCsvCell, value: boolean) => (cell.hasData ? (value ? "true" : "false") : null);

/**
 * The calendar table as CSV, one row per month on screen: a header of "#" comment rows (title, unit, area, period,
 * series, model version, source), then `year,month,count,ci90_low,ci90_high,is_estimated,is_partial,source_satellite,
 * series,time_of_day,model_version`. A month with no data or no estimate has an empty count, never 0; a month outside
 * the data has empty flags too. Counts and intervals are rounded to whole numbers like the table on screen.
 * The estimated and partial months are also listed in comment rows at the end.
 */
export function calendarCsv(rows: readonly CalendarCsvRow[], meta: ExportMeta, context: CalendarCsvContext): string {
  const lines = [
    commentRow("Title", meta.title),
    commentRow("Unit", meta.unit),
    commentRow("Area", meta.area),
    commentRow("Period", meta.period),
    commentRow("Series", meta.series),
    commentRow("Model version", meta.modelVersion),
    commentRow("Source", meta.source),
    commentRow("Note", `Empty count = no data or no estimate (not zero). ${NOT_FIRES_TEXT}`),
    commentRow(
      "Interval",
      context.series === "raw_by_sensor"
        ? "ci90_low and ci90_high are empty: native counts carry no interval (intervals belong to the harmonized series)."
        : `ci90_low and ci90_high are the 90% interval of months estimated from MODIS (equal to count when observed; empty when there is none).${
            context.intervalApproximate ? " For an area the interval is approximate: the errors of nearby cells are correlated." : ""
          }`,
    ),
  ];
  lines.push(CALENDAR_CSV_COLUMNS.join(","));
  for (const row of rows) {
    for (const cell of row.cells) {
      lines.push(
        [
          row.year,
          cell.month,
          round(cell.count),
          round(cell.ciLow),
          round(cell.ciHigh),
          flag(cell, cell.estimated),
          flag(cell, cell.partial),
          cell.sourceSatellite,
          context.series,
          context.timeOfDay,
          context.modelVersion,
        ]
          .map(csvField)
          .join(","),
      );
    }
  }
  const flagged = (pick: (cell: CalendarCsvCell) => boolean) =>
    monthRuns(
      rows.flatMap((row) => row.cells.filter((cell) => cell.count !== null && pick(cell)).map((cell) => row.year * 12 + cell.month - 1)),
    );
  lines.push(commentRow("Estimated from MODIS (before 2012-02)", flagged((cell) => cell.estimated) || "none"));
  lines.push(commentRow("Partial months (not complete; not comparable)", flagged((cell) => cell.partial) || "none"));
  return `${lines.join("\r\n")}\r\n`;
}

/** Lowercase ASCII file name: `astro-boys-<what>-<parts>.<ext>`. */
export function exportFileName(what: string, parts: ReadonlyArray<string | number>, ext: string): string {
  const slug = (text: string | number) =>
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return ["astro-boys", what, ...parts].map(slug).filter(Boolean).join("-") + `.${ext}`;
}

/** Greedy word wrap by character count (a very long word stays whole). */
export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type ComposeInput = {
  /** The chart, already with its styles inlined, as `<svg ...>...</svg>`. */
  chartMarkup: string;
  chartWidth: number;
  chartHeight: number;
  meta: ExportMeta;
  colors: { background: string; text: string; secondary: string };
  fontFamily: string;
};

const PAD = 16;
const TITLE_SIZE = 16;
const TEXT_SIZE = 11;
const LINE_HEIGHT = 15;

/**
 * A standalone SVG: title, scale and legend above the chart; unit, area, period, source and model version below.
 * Text only, so it needs no stylesheet and no font file; the colors are the ones of the theme on screen.
 */
export function composeExportSvg(input: ComposeInput): { svg: string; width: number; height: number } {
  const { meta, colors } = input;
  const width = Math.max(Math.ceil(input.chartWidth) + PAD * 2, 480);
  const maxChars = Math.floor((width - PAD * 2) / (TEXT_SIZE * 0.56));
  const text = (y: number, size: number, fill: string, body: string, weight = 400) =>
    `<text x="${PAD}" y="${y}" font-family="${escapeXml(input.fontFamily)}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(body)}</text>`;

  const parts: string[] = [];
  let y = PAD + TITLE_SIZE;
  parts.push(text(y, TITLE_SIZE, colors.text, meta.title, 700));
  const head = [meta.series, ...(meta.legend ?? [])].flatMap((line) => wrapText(line, maxChars));
  for (const line of head) {
    y += LINE_HEIGHT;
    parts.push(text(y, TEXT_SIZE, colors.secondary, line));
  }
  const chartY = y + 10;
  const chartX = Math.round((width - input.chartWidth) / 2);
  parts.push(`<g transform="translate(${chartX} ${chartY})">${input.chartMarkup}</g>`);
  y = chartY + Math.ceil(input.chartHeight) + 8;
  const foot = [
    `Unit: ${meta.unit}`,
    `Area: ${meta.area}`,
    `Period: ${meta.period}`,
    `Source: ${meta.source}`,
    `Model version: ${meta.modelVersion}`,
    NOT_FIRES_TEXT,
  ].flatMap((line) => wrapText(line, maxChars));
  for (const line of foot) {
    y += LINE_HEIGHT;
    parts.push(text(y, TEXT_SIZE, colors.secondary, line));
  }
  const height = y + PAD;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(meta.title)}">` +
    `<title>${escapeXml(meta.title)}</title>` +
    `<rect width="${width}" height="${height}" fill="${colors.background}"/>` +
    parts.join("") +
    `</svg>`;
  return { svg, width, height };
}
