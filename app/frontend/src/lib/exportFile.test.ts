import { describe, expect, it } from "vitest";
import {
  areaText,
  CALENDAR_CSV_COLUMNS,
  calendarCsv,
  composeExportSvg,
  csvField,
  exportFileName,
  periodText,
  wrapText,
  type CalendarCsvCell,
  type CalendarCsvContext,
  type CalendarCsvRow,
  type ExportMeta,
} from "./exportFile";

const META: ExportMeta = {
  title: "Burning calendar table",
  unit: "VIIRS-equivalent hotspot detections per month",
  series: "Harmonized",
  area: areaText({ west: -48.8, south: -18.4, east: -34.7, north: -1 }),
  period: periodText(2002, 2003, "ALL"),
  modelVersion: "v1",
  source: "NASA FIRMS",
};

const cell = (
  month: number,
  count: number | null,
  flags: { estimated?: boolean; partial?: boolean; ci?: [number, number]; hasData?: boolean } = {},
): CalendarCsvCell => ({
  month,
  label: ["Jan", "Feb", "Mar"][month - 1],
  count,
  ciLow: flags.ci?.[0] ?? (flags.estimated ? null : count),
  ciHigh: flags.ci?.[1] ?? (flags.estimated ? null : count),
  estimated: flags.estimated ?? false,
  partial: flags.partial ?? false,
  sourceSatellite: count === null ? null : flags.estimated ? "Aqua" : "SNPP",
  hasData: flags.hasData ?? true,
});

const CONTEXT: CalendarCsvContext = { series: "harmonized", timeOfDay: "ALL", modelVersion: "v1", intervalApproximate: true };

const ROWS: CalendarCsvRow[] = [
  { year: 2002, cells: [cell(1, null, { hasData: false }), cell(2, 0), cell(3, 12345.6, { estimated: true, ci: [10000.4, 15000.5] })] },
  { year: 2003, cells: [cell(1, 7), cell(2, null), cell(3, 9, { partial: true })] },
];

describe("calendarCsv", () => {
  const lines = calendarCsv(ROWS, META, CONTEXT).trimEnd().split("\r\n");

  it("starts with comment rows that state unit, area, period, series, model version and source", () => {
    const header = lines.filter((l) => l.startsWith("#")).join("\n");
    expect(header).toContain("# Unit: VIIRS-equivalent hotspot detections per month");
    expect(header).toContain("# Area: -48.8 to -34.7 longitude; -18.4 to -1 latitude");
    expect(header).toContain("# Period: 2002-2003; day and night");
    expect(header).toContain("# Series: Harmonized");
    expect(header).toContain("# Model version: v1");
    expect(header).toContain("# Source: NASA FIRMS");
    expect(header).toContain("approximate");
  });

  it("has one row per month with interval, flags and provenance columns", () => {
    expect(lines).toContain(CALENDAR_CSV_COLUMNS.join(","));
    expect(lines).toContain("2002,3,12346,10000,15001,true,false,Aqua,harmonized,ALL,v1");
    expect(lines).toContain("2003,3,9,9,9,false,true,SNPP,harmonized,ALL,v1");
    expect(lines.filter((l) => /^\d{4},/.test(l))).toHaveLength(6);
  });

  it("keeps no data empty and a real zero as 0", () => {
    expect(lines).toContain("2002,1,,,,,,,harmonized,ALL,v1");
    expect(lines).toContain("2002,2,0,0,0,false,false,SNPP,harmonized,ALL,v1");
    expect(lines).toContain("2003,2,,,,false,false,,harmonized,ALL,v1");
  });

  it("lists the estimated and partial months", () => {
    expect(lines).toContain("# Estimated from MODIS (before 2012-02): 2002-03");
    expect(lines).toContain("# Partial months (not complete; not comparable): 2003-03");
  });

  it("writes runs of months compactly", () => {
    const rows: CalendarCsvRow[] = [
      { year: 2002, cells: [cell(1, 1, { estimated: true }), cell(2, 1, { estimated: true }), cell(3, 1, { estimated: true })] },
      { year: 2003, cells: [cell(1, 1, { estimated: true }), cell(2, null), cell(3, 1, { estimated: true })] },
    ];
    expect(calendarCsv(rows, META, CONTEXT)).toContain("# Estimated from MODIS (before 2012-02): 2002-01 to 2002-03 2003-01 2003-03");
  });

  it("says raw native counts carry no interval", () => {
    const raw = calendarCsv(ROWS, META, { ...CONTEXT, series: "raw_by_sensor", intervalApproximate: false });
    expect(raw).toContain("# Interval: ci90_low and ci90_high are empty: native counts carry no interval");
    expect(raw).toContain(",raw_by_sensor,ALL,v1");
  });

  it("has no comma inside a comment row", () => {
    for (const line of lines.filter((l) => l.startsWith("#"))) expect(line).not.toContain(",");
  });
});

describe("csvField", () => {
  it("quotes commas, quotes and line breaks; null is empty", () => {
    expect(csvField('a,"b"')).toBe('"a,""b"""');
    expect(csvField(null)).toBe("");
    expect(csvField(0)).toBe("0");
  });
});

describe("exportFileName", () => {
  it("is lowercase ASCII with the extension", () => {
    expect(exportFileName("calendar", ["harmonized", "2002-2026", "ALL"], "csv")).toBe(
      "astro-boys-calendar-harmonized-2002-2026-all.csv",
    );
  });
});

describe("wrapText", () => {
  it("wraps on words and never loses text", () => {
    expect(wrapText("one two three four five", 9)).toEqual(["one two", "three", "four five"]);
    expect(wrapText("", 10)).toEqual([]);
  });
});

describe("composeExportSvg", () => {
  const out = composeExportSvg({
    chartMarkup: '<svg width="640" height="280"></svg>',
    chartWidth: 640,
    chartHeight: 280,
    meta: { ...META, title: "Trend & more", legend: ["Solid: harmonized"] },
    colors: { background: "rgb(1, 2, 3)", text: "#fff", secondary: "#ccc" },
    fontFamily: 'Inter, "Segoe UI"',
  });

  it("is a standalone SVG with the background and the text a reader needs", () => {
    expect(out.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(out.svg).toContain('fill="rgb(1, 2, 3)"');
    expect(out.svg).toContain("Trend &amp; more");
    for (const text of [
      "Unit: VIIRS-equivalent",
      "Area: -48.8",
      "Period: 2002-2003",
      "Source: NASA FIRMS",
      "Model version: v1",
      "Solid: harmonized",
    ]) {
      expect(out.svg).toContain(text);
    }
    expect(out.svg).not.toContain("var(--");
  });

  it("is taller than the chart by the text around it", () => {
    expect(out.height).toBeGreaterThan(280 + 60);
    expect(out.width).toBe(640 + 32);
  });
});
