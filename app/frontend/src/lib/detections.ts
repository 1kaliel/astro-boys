/**
 * The "Detections" map layer: every native FIRMS detection of the month as its own dot, at the centre of the pixel
 * where the satellite saw it, instead of a count summed over a 0.25° cell (about 28 km).
 *
 * These are raw detections of ONE platform (S-NPP by default, the source of the harmonized calendar), not harmonized:
 * harmonization is a statistic of cell-months, so a single detection has no harmonized position. Dots are drawn
 * with the ground size of the sensor's pixel once the map is zoomed in (VIIRS 375 m, MODIS 1 km at nadir).
 */
import type { ExpressionSpecification } from "maplibre-gl";
import type { Bounds } from "./grid";

export type Satellite = "SNPP" | "N20" | "N21" | "Aqua" | "Terra";

export type PointsResponse = {
  year: number;
  month: number;
  period: "ALL" | "D" | "N";
  satellite: Satellite | null;
  available: Partial<Record<Satellite, number>>;
  rows: number;
  max_points: number;
  sampled: boolean;
  /** [lon, lat, frp_mw or null, night] */
  points: [number, number, number | null, boolean][];
};

export const SATELLITE_LABEL: Record<Satellite, string> = {
  SNPP: "S-NPP (VIIRS)",
  N20: "NOAA-20 (VIIRS)",
  N21: "NOAA-21 (VIIRS)",
  Aqua: "Aqua (MODIS)",
  Terra: "Terra (MODIS)",
};

/** Nominal ground size of a pixel at nadir, in metres. */
export function pixelSizeM(satellite: Satellite): number {
  return satellite === "Aqua" || satellite === "Terra" ? 1000 : 375;
}

export function pointsUrl(
  area: Bounds,
  month: { year: number; month: number },
  period: "ALL" | "D" | "N",
  satellite?: Satellite | null,
): string {
  const params = new URLSearchParams({
    year: String(month.year),
    month: String(month.month),
    west: String(area.west),
    south: String(area.south),
    east: String(area.east),
    north: String(area.north),
    period,
  });
  if (satellite) params.set("satellite", satellite);
  return `/api/hotspots/points?${params}`;
}

export type DetectionProps = { frp: number | null; night: boolean };

export function pointsGeoJSON(data: PointsResponse | null): GeoJSON.FeatureCollection<GeoJSON.Point, DetectionProps> {
  return {
    type: "FeatureCollection",
    features: (data?.points ?? []).map(([lon, lat, frp, night]) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: { frp, night },
    })),
  };
}

const EARTH_M_PER_PX_Z0 = 156_543.03; // Web Mercator, 256 px tiles, at the equator

/**
 * Circle radius (px) by zoom so a dot covers the pixel's ground size at latitude `lat`, never smaller than
 * `minPx` (so it stays visible when zoomed out). MapLibre interpolates between the stops.
 */
export function radiusByZoom(sizeM: number, lat: number, minPx = 1.3, zooms = [3, 6, 8, 10, 12, 14]): ExpressionSpecification {
  const cos = Math.cos((lat * Math.PI) / 180);
  const stops = zooms.flatMap((z) => {
    const metresPerPx = (EARTH_M_PER_PX_Z0 * cos) / 2 ** z;
    return [z, Math.max(minPx, Math.round((sizeM / 2 / metresPerPx) * 100) / 100)];
  });
  return ["interpolate", ["exponential", 2], ["zoom"], ...stops] as unknown as ExpressionSpecification;
}
