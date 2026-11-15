import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { ON_IMAGERY, satelliteStyle } from "./basemap";

const vector: StyleSpecification = {
  version: 8,
  glyphs: "https://example.org/fonts/{fontstack}/{range}.pbf",
  sources: { openmaptiles: { type: "vector", url: "https://example.org/tiles" } },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#fff" } },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water" },
    { id: "road", type: "line", source: "openmaptiles", "source-layer": "transportation" },
    { id: "boundary_country", type: "line", source: "openmaptiles", "source-layer": "boundary" },
    { id: "place_city", type: "symbol", source: "openmaptiles", "source-layer": "place", paint: { "text-color": "#333" } },
    { id: "poi", type: "symbol", source: "openmaptiles", "source-layer": "poi" },
  ],
};

describe("satellite basemap", () => {
  it("draws the imagery first, then only the borders and place names, repainted for the imagery", () => {
    const style = satelliteStyle(vector);
    expect(style.layers.map((l) => l.id)).toEqual([
      "background",
      "imagery-base",
      "imagery",
      "boundary_country",
      "place_city",
    ]);
    const city = style.layers.find((l) => l.id === "place_city");
    expect(city?.type === "symbol" && city.paint?.["text-color"]).toBe(ON_IMAGERY);
    expect(style.glyphs).toBe(vector.glyphs);
    expect(Object.keys(style.sources)).toEqual(["openmaptiles", "imagery-base", "imagery"]);
  });

  it("is the imagery alone when the vector style could not be loaded", () => {
    const style = satelliteStyle(null);
    expect(style.layers.map((l) => l.id)).toEqual(["background", "imagery-base", "imagery"]);
    expect(style.glyphs).toBeUndefined();
  });
});
