import { describe, expect, it } from "vitest";
import {
  areaText,
  calendarCsv,
  composeExportSvg,
  csvField,
  exportFileName,
  periodText,
  wrapText,
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

const cell = (month: number, count: number | null, flags: { estimated?: boolean; partial?: boolean } = {}) => ({
  month,
  label: ["Jan", "Feb", "Mar"][month - 1],
  count,
  estimated: flags.estimated ?? false,
  partial: flags.partial ?? false,
});

const ROWS: CalendarCsvRow[] = [
  { year: 2002, cells: [cell(1, null), cell(2, 0), cell(3, 12345.6, { estimated: true })] },
  { year: 2003, cells: [cell(1, 7), cell(2, null), cell(3, 9, { partial: true })] },
];

describe("calendarCsv", () => {
  const lines = calendarCsv(ROWS, META).trimEnd().split("\r\n");

  it("starts with comment rows that state unit, area, period, series, model version and source", () => {
    const header = lines.filter((l) => l.startsWith("#")).join("\n");
    expect(header).toContain("# Unit: VIIRS-equivalent hotspot detections per month");
    expect(header).toContain("# Area: -48.8 to -34.7 longitude; -18.4 to -1 latitude");
    expect(header).toContain("# Period: 2002-2003; day and night");
    expect(header).toContain("# Series: Harmonized");
    expect(header).toContain("# Model version: v1");
    expect(header).toContain("# Source: NASA FIRMS");
  });

  it("keeps no data empty and a real zero as 0, with plain integers", () => {
    expect(lines).toContain("year,Jan,Feb,Mar");
    expect(lines).toContain("2002,,0,12346");
    expect(lines).toContain("2003,7,,9");
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
    expect(calendarCsv(rows, META)).toContain("# Estimated from MODIS (before 2012-02): 2002-01 to 2002-03 2003-01 2003-03");
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
