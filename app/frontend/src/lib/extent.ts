/**
 * The extent the dashboard covers: the one the data was built for (`ASTRO_EXTENT` of the pipeline).
 *
 * Chosen at build time with `VITE_ASTRO_EXTENT` (`northeast`, the default pilot, or `brazil`), so the frame, the
 * texts and the area checks match the calendar the backend serves. The boxes are the pipeline's (src/astro_fire/
 * batch.py `EXTENTS`).
 */
import type { Bounds } from "./grid";

export type Extent = {
  id: "northeast" | "brazil";
  bounds: Bounds;
  /** "Northeast Brazil", "Brazil": in titles and sentences. */
  name: string;
  /** Pan limits of the flat map, [west, south, east, north]: the box with a margin. */
  limits: [number, number, number, number];
  /** Where the 3D globe starts. */
  home: { lat: number; lng: number; altitude: number };
};

export const EXTENTS: Record<Extent["id"], Extent> = {
  northeast: {
    id: "northeast",
    bounds: { west: -48.8, south: -18.4, east: -34.7, north: -1.0 },
    name: "Northeast Brazil",
    limits: [-80, -40, -20, 14],
    home: { lat: -10, lng: -41, altitude: 1.4 },
  },
  brazil: {
    id: "brazil",
    bounds: { west: -74.0, south: -34.0, east: -28.0, north: 6.0 },
    name: "Brazil",
    limits: [-90, -45, -15, 16],
    home: { lat: -14, lng: -52, altitude: 2.0 },
  },
};

export function extentOf(value: string | undefined): Extent {
  return value === "brazil" ? EXTENTS.brazil : EXTENTS.northeast;
}

export const EXTENT: Extent = extentOf(import.meta.env.VITE_ASTRO_EXTENT as string | undefined);
