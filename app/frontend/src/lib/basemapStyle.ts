import type { StyleSpecification } from "maplibre-gl";

/**
 * The cartographic palette of the dark theme: a real map (blue ocean, teal land, visible borders and names) under the
 * dark interface, not a black one. The OpenFreeMap "liberty" style supplies the geography (coast lines, borders, city
 * and state names, relief); this only repaints it. The light theme keeps liberty's own colors.
 */
export const MAP_PALETTE = {
  ocean: "#0b3855",
  waterway: "#1b5c80",
  land: "#22393b",
  landSoft: "#2a4345",
  detail: "#355052",
  border: "#78949a",
  borderCountry: "#a3b9be",
  label: "#e1ebee",
  halo: "#0b1626",
  waterLabel: "#8fb6d4",
  road: "#3f5c5e",
} as const;

type AnyLayer = StyleSpecification["layers"][number];

const LAND_DETAIL = new Set(["park", "landcover_wood", "landcover_grass", "landcover_wetland"]);
const LAND_SOFT = new Set([
  "landuse_residential",
  "landuse_pitch",
  "landuse_track",
  "landuse_cemetery",
  "landuse_hospital",
  "landuse_school",
  "landcover_sand",
  "landcover_ice",
  "aeroway_fill",
  "building",
]);

function paintOf(layer: AnyLayer, changes: Record<string, unknown>): AnyLayer {
  return { ...layer, paint: { ...("paint" in layer ? layer.paint : {}), ...changes } } as AnyLayer;
}

/** A copy of the style with the dark-theme palette. Layers it does not know are left exactly as they are. */
export function patchBasemapStyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map((layer): AnyLayer => {
    const id = layer.id;
    if (layer.type === "background") return paintOf(layer, { "background-color": MAP_PALETTE.land });
    if (id === "natural_earth") {
      // The shaded relief of the low zooms stays, but quiet, so it adds texture instead of a pale wash.
      return paintOf(layer, { "raster-opacity": 0.3, "raster-brightness-max": 0.45, "raster-saturation": -0.4 });
    }
    if (id === "water") return paintOf(layer, { "fill-color": MAP_PALETTE.ocean });
    if (id.startsWith("waterway_") && layer.type === "line")
      return paintOf(layer, { "line-color": MAP_PALETTE.waterway });
    if (LAND_DETAIL.has(id)) return paintOf(layer, { "fill-color": MAP_PALETTE.detail });
    if (LAND_SOFT.has(id)) return paintOf(layer, { "fill-color": MAP_PALETTE.landSoft });
    if (layer.type === "fill-extrusion")
      return { ...layer, layout: { ...layer.layout, visibility: "none" } } as AnyLayer;
    if (id === "boundary_2") return paintOf(layer, { "line-color": MAP_PALETTE.borderCountry });
    if (id.startsWith("boundary_")) return paintOf(layer, { "line-color": MAP_PALETTE.border });
    if (layer.type === "line" && (id.startsWith("road_") || id.startsWith("aeroway_"))) {
      return paintOf(layer, { "line-color": MAP_PALETTE.road });
    }
    if (layer.type === "symbol" && (id.startsWith("water_name") || id === "waterway_line_label")) {
      return paintOf(layer, { "text-color": MAP_PALETTE.waterLabel, "text-halo-color": MAP_PALETTE.halo });
    }
    if (layer.type === "symbol" && id.startsWith("label_")) {
      return paintOf(layer, {
        "text-color": MAP_PALETTE.label,
        "text-halo-color": MAP_PALETTE.halo,
        "text-halo-width": 1.2,
      });
    }
    return layer;
  });
  return { ...style, layers };
}
