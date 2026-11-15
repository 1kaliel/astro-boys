/**
 * The outline of Brazil, to clip the live wind to the country (the model lattice is a rectangle much wider than it).
 *
 * Source: Natural Earth 1:50m admin-0 countries (public domain), through the `world-atlas` package (TopoJSON). It is
 * bundled with the app (no request to a data service) and only loaded, as its own chunk, when a layer needs it. At
 * 1:50m the coast and borders are generalized by a few km, far finer than the 4° wind lattice.
 */
import type { Bounds } from "./grid";

export type Outline = {
  /** Polygons of the country, each a list of rings ([lon, lat] pairs), the first ring the outer one. */
  polygons: number[][][][];
  bounds: Bounds;
  geojson: GeoJSON.Feature<GeoJSON.MultiPolygon>;
};

/** ISO 3166-1 numeric code of Brazil, the feature id in world-atlas. */
const BRAZIL_ID = "076";

/** Even-odd ray casting on one ring. */
function inRing(lon: number, lat: number, ring: readonly number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The point is inside one of the polygons (inside its outer ring and outside its holes). */
export function contains(outline: Pick<Outline, "polygons" | "bounds">, lon: number, lat: number): boolean {
  const b = outline.bounds;
  if (lon < b.west || lon > b.east || lat < b.south || lat > b.north) return false;
  return outline.polygons.some(
    ([outer, ...holes]) => inRing(lon, lat, outer) && !holes.some((hole) => inRing(lon, lat, hole)),
  );
}

export function outlineFromGeometry(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): Outline {
  const polygons = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates) as number[][][][];
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of polygons)
    for (const [lon, lat] of polygon[0]) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  return {
    polygons,
    bounds: { west, south, east, north },
    geojson: { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: polygons } },
  };
}

let cached: Promise<Outline> | null = null;

/** Loads (once) the outline of Brazil. */
export function loadBrazil(): Promise<Outline> {
  cached ??= Promise.all([import("world-atlas/countries-50m.json"), import("topojson-client")]).then(
    ([atlas, topojson]) => {
      // The TopoJSON file has no bundled types.
      const topology = (atlas.default ?? atlas) as any;
      const countries = topojson.feature(topology, topology.objects.countries) as unknown as GeoJSON.FeatureCollection<
        GeoJSON.Polygon | GeoJSON.MultiPolygon
      >;
      const brazil = countries.features.find((f) => String(f.id) === BRAZIL_ID);
      if (!brazil) throw new Error("Brazil is missing from the country outlines");
      return outlineFromGeometry(brazil.geometry);
    },
  );
  return cached;
}
