import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

/**
 * The basemap is satellite imagery with borders and place names on top, like Google Earth, in both themes.
 *
 * * Imagery: Sentinel-2 cloudless 2016 by EOX (CC BY 4.0, 10 m), over NASA GIBS Blue Marble (the same imagery as the
 *   3D globe, 500 m), which shows through wherever an EOX tile is missing or the service is down.
 * * Borders and names: the vector layers of the OpenFreeMap Positron style (free, no key, provided as-is), repainted
 *   white on a dark halo so they read on the imagery. If OpenFreeMap is down, the imagery is shown alone.
 *
 * Attribution comes with each source and stays visible.
 */
export const LABELS_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const EOX_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";
const GIBS_TILES =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
/** Ink of everything drawn on the imagery (streaks, arrows, labels, the outline of Brazil), on a dark halo. */
export const ON_IMAGERY = "#ffffff";
export const ON_IMAGERY_HALO = "rgba(0, 0, 0, 0.75)";
/** The label layers of the vector style that are kept (names of places and water); borders are kept too. */
const LABEL_SOURCE_LAYERS = new Set(["place", "water_name"]);

/** Satellite imagery, with the borders and names of `labels` on top when that style could be loaded. */
export function satelliteStyle(labels: StyleSpecification | null): StyleSpecification {
  const overlay: LayerSpecification[] = [];
  for (const layer of labels?.layers ?? []) {
    const sourceLayer = "source-layer" in layer ? layer["source-layer"] : undefined;
    if (layer.type === "symbol" && sourceLayer && LABEL_SOURCE_LAYERS.has(sourceLayer)) {
      overlay.push({
        ...layer,
        paint: { ...layer.paint, "text-color": ON_IMAGERY, "text-halo-color": ON_IMAGERY_HALO, "text-halo-width": 1.2 },
      });
    } else if (layer.type === "line" && sourceLayer === "boundary") {
      overlay.push({ ...layer, paint: { ...layer.paint, "line-color": ON_IMAGERY, "line-opacity": 0.6 } });
    }
  }
  return {
    version: 8,
    ...(labels?.glyphs ? { glyphs: labels.glyphs } : {}),
    ...(labels?.sprite ? { sprite: labels.sprite } : {}),
    sources: {
      ...(labels?.sources ?? {}),
      "imagery-base": {
        type: "raster",
        tiles: [GIBS_TILES],
        tileSize: 256,
        maxzoom: 8,
        attribution: "Imagery: NASA GIBS Blue Marble",
      },
      imagery: {
        type: "raster",
        tiles: [EOX_TILES],
        tileSize: 256,
        maxzoom: 14,
        attribution:
          '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016)',
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#0b1d2e" } },
      { id: "imagery-base", type: "raster", source: "imagery-base" },
      { id: "imagery", type: "raster", source: "imagery", paint: { "raster-fade-duration": 0 } },
      ...overlay,
    ],
  };
}
