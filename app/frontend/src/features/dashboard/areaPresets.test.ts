import { describe, expect, it } from "vitest";
import { cellsInBounds } from "../../lib/grid";
import { PILOT_BOUNDS } from "../../state/dashboard";
import { COUNTRIES, REGIONS, STATE_PRESETS, presetArea, presetForLabel, presetLabel } from "./areaPresets";

describe("state presets (approximate boxes)", () => {
  it("lists the nine Northeast states once each", () => {
    expect(STATE_PRESETS).toHaveLength(9);
    expect(new Set(STATE_PRESETS.map((p) => p.id)).size).toBe(9);
  });

  it.each(STATE_PRESETS.map((p) => [p.name, p] as const))("%s lies inside the study box after clamping, with cells", (_, preset) => {
    const { area, cells } = presetArea(preset);
    expect(area.west).toBeGreaterThanOrEqual(PILOT_BOUNDS.west);
    expect(area.south).toBeGreaterThanOrEqual(PILOT_BOUNDS.south);
    expect(area.east).toBeLessThanOrEqual(PILOT_BOUNDS.east);
    expect(area.north).toBeLessThanOrEqual(PILOT_BOUNDS.north);
    expect(area.west).toBeLessThan(area.east);
    expect(area.south).toBeLessThan(area.north);
    expect(cells).toBeGreaterThanOrEqual(1);
    expect(cells).toBe(cellsInBounds(area).length);
  });

  it("round-trips a label back to its preset", () => {
    for (const preset of STATE_PRESETS) expect(presetForLabel(presetLabel(preset))).toBe(preset);
    expect(presetLabel(STATE_PRESETS[2])).toBe("Ceará (approximate box)");
    expect(presetForLabel(null)).toBeUndefined();
    expect(presetForLabel("Custom")).toBeUndefined();
  });

  it("enables only South America and Brazil", () => {
    expect(REGIONS.filter((r) => r.enabled).map((r) => r.name)).toEqual(["South America"]);
    expect(COUNTRIES.filter((c) => c.enabled).map((c) => c.name)).toEqual(["Brazil"]);
  });
});
