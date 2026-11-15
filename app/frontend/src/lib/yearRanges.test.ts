import { describe, expect, it } from "vitest";
import { activePreset, presetRanges } from "./yearRanges";

describe("year presets", () => {
  const presets = presetRanges(2002, 2026);

  it("builds the four ranges from the years the data covers", () => {
    expect(presets.map((p) => [p.id, p.startYear, p.endYear])).toEqual([
      ["last5", 2022, 2026],
      ["last10", 2017, 2026],
      ["viirs", 2012, 2026],
      ["all", 2002, 2026],
    ]);
  });

  it("never reaches before the first year of the data", () => {
    const short = presetRanges(2024, 2026);
    expect(short.every((p) => p.startYear >= 2024 && p.endYear === 2026)).toBe(true);
  });

  it("finds the preset that matches the range, or none for a custom range", () => {
    expect(activePreset(presets, 2017, 2026)?.id).toBe("last10");
    expect(activePreset(presets, 2002, 2026)?.id).toBe("all");
    expect(activePreset(presets, 2015, 2020)).toBeNull();
  });
});
