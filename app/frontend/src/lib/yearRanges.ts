/** First year VIIRS observes (S-NPP, February 2012): the calendar's "VIIRS era". */
export const VIIRS_FIRST_YEAR = 2012;

export type YearPreset = { id: "last5" | "last10" | "viirs" | "all"; label: string; startYear: number; endYear: number };

/** Quick year ranges for the calendar, clamped to the years the data covers. */
export function presetRanges(firstYear: number, lastYear: number): YearPreset[] {
  const from = (start: number) => Math.min(lastYear, Math.max(firstYear, start));
  return [
    { id: "last5", label: "Last 5", startYear: from(lastYear - 4), endYear: lastYear },
    { id: "last10", label: "Last 10", startYear: from(lastYear - 9), endYear: lastYear },
    { id: "viirs", label: "VIIRS era", startYear: from(VIIRS_FIRST_YEAR), endYear: lastYear },
    { id: "all", label: "All", startYear: firstYear, endYear: lastYear },
  ];
}

/** The preset that matches the years on screen (the first one when several match), or null for a custom range. */
export function activePreset(presets: readonly YearPreset[], startYear: number, endYear: number): YearPreset | null {
  return presets.find((preset) => preset.startYear === startYear && preset.endYear === endYear) ?? null;
}
