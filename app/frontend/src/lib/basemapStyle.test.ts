import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { MAP_PALETTE, patchBasemapStyle } from "./basemapStyle";

const style = {
  version: 8,
  sources: {},
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f8f4f0" } },
    { id: "water", type: "fill", source: "s", paint: { "fill-color": "rgb(158,189,255)", "fill-opacity": 1 } },
    { id: "landcover_wood", type: "fill", source: "s", paint: { "fill-color": "hsla(98,61%,72%,0.7)" } },
    { id: "boundary_2", type: "line", source: "s", paint: { "line-color": "hsl(248,1%,41%)", "line-width": 2 } },
    { id: "boundary_3", type: "line", source: "s", paint: { "line-color": "hsl(0,0%,70%)" } },
    { id: "label_city", type: "symbol", source: "s", paint: { "text-color": "#000" } },
    { id: "building-3d", type: "fill-extrusion", source: "s", paint: { "fill-extrusion-color": "#ccc" } },
    { id: "something_unknown", type: "line", source: "s", paint: { "line-color": "#123456" } },
  ],
} as unknown as StyleSpecification;

const byId = (s: StyleSpecification, id: string) => s.layers.find((l) => l.id === id) as unknown as Record<string, any>;

describe("dark basemap palette", () => {
  const patched = patchBasemapStyle(style);

  it("makes the land teal and the ocean blue, never black", () => {
    expect(byId(patched, "background").paint["background-color"]).toBe(MAP_PALETTE.land);
    expect(byId(patched, "water").paint["fill-color"]).toBe(MAP_PALETTE.ocean);
    for (const color of [MAP_PALETTE.land, MAP_PALETTE.ocean, MAP_PALETTE.detail]) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
      expect(Math.max(r, g, b)).toBeGreaterThan(0x30); // not a black map
    }
  });

  it("keeps the other paint properties of a layer it repaints", () => {
    expect(byId(patched, "water").paint["fill-opacity"]).toBe(1);
    expect(byId(patched, "boundary_2").paint["line-width"]).toBe(2);
  });

  it("draws borders and names so they read on the land and the ocean", () => {
    expect(byId(patched, "boundary_2").paint["line-color"]).toBe(MAP_PALETTE.borderCountry);
    expect(byId(patched, "boundary_3").paint["line-color"]).toBe(MAP_PALETTE.border);
    expect(byId(patched, "label_city").paint["text-color"]).toBe(MAP_PALETTE.label);
    expect(byId(patched, "label_city").paint["text-halo-color"]).toBe(MAP_PALETTE.halo);
  });

  it("hides the 3D buildings and leaves unknown layers and the input untouched", () => {
    expect(byId(patched, "building-3d").layout.visibility).toBe("none");
    expect(byId(patched, "something_unknown").paint["line-color"]).toBe("#123456");
    expect(byId(style, "water").paint["fill-color"]).toBe("rgb(158,189,255)"); // not mutated
  });
});
