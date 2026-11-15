/**
 * A wind field built from the sampled live points, for the animation of the "Live wind" layer.
 *
 * The points are a regular lattice (a sample of the weather model, 4° apart). The field between them is a bilinear
 * interpolation of the east and north components, which is what any wind animation does with gridded data. Outside the
 * lattice, or where a corner has no value, the field is unknown (null): nothing is invented there.
 *
 * An optional clip (the outline of Brazil) limits the field to a shape: outside it, the field is null too, so the
 * streaks are born and live only inside the country, even though the lattice is a wider rectangle.
 */
import type { Bounds } from "./grid";

/** A shape the field is limited to: its bounding box and a point test. */
export type FieldClip = { bounds: Bounds; contains: (lon: number, lat: number) => boolean };

export type WindSample = { lat: number; lon: number; wind_speed_kmh: number | null; wind_from_deg: number | null };

/** East (u) and north (v) components in km/h of a wind that blows FROM `fromDeg` (meteorological convention). */
export function windVector(speedKmh: number, fromDeg: number): { u: number; v: number } {
  const rad = (fromDeg * Math.PI) / 180;
  return { u: -speedKmh * Math.sin(rad), v: -speedKmh * Math.cos(rad) };
}

const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LON_EQ = 111.32;

/** Moves a position by a wind (km/h) over some hours; longitude degrees shrink with the cosine of the latitude. */
export function advance(lon: number, lat: number, u: number, v: number, hours: number): [number, number] {
  const cos = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return [lon + (u * hours) / (KM_PER_DEG_LON_EQ * cos), lat + (v * hours) / KM_PER_DEG_LAT];
}

export class WindField {
  readonly lons: number[];
  readonly lats: number[];
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
  private readonly cells = new Map<string, { u: number; v: number }>();
  private readonly clip: FieldClip | null;

  constructor(points: readonly WindSample[], clip: FieldClip | null = null) {
    this.clip = clip;
    const lons = new Set<number>();
    const lats = new Set<number>();
    for (const p of points) {
      lons.add(p.lon);
      lats.add(p.lat);
      if (p.wind_speed_kmh !== null && p.wind_from_deg !== null) {
        this.cells.set(`${p.lat}|${p.lon}`, windVector(p.wind_speed_kmh, p.wind_from_deg));
      }
    }
    this.lons = [...lons].sort((a, b) => a - b);
    this.lats = [...lats].sort((a, b) => a - b);
    this.west = this.lons[0] ?? 0;
    this.east = this.lons.at(-1) ?? 0;
    this.south = this.lats[0] ?? 0;
    this.north = this.lats.at(-1) ?? 0;
  }

  /** The lattice has at least one full cell (two longitudes and two latitudes). */
  get usable(): boolean {
    return this.lons.length >= 2 && this.lats.length >= 2;
  }

  /** Where streaks can be born: the lattice, narrowed to the clip's bounding box when there is a clip. */
  get spawnBounds(): Bounds {
    const c = this.clip?.bounds;
    if (!c) return { west: this.west, south: this.south, east: this.east, north: this.north };
    return {
      west: Math.max(this.west, c.west),
      south: Math.max(this.south, c.south),
      east: Math.min(this.east, c.east),
      north: Math.min(this.north, c.north),
    };
  }

  /** u, v (km/h) and speed at a position, or null outside the lattice, outside the clip or where a corner has no value. */
  sample(lon: number, lat: number): { u: number; v: number; speed: number } | null {
    // Written so that NaN (a streak with no position yet) is outside too.
    if (!this.usable || !(lon >= this.west && lon <= this.east && lat >= this.south && lat <= this.north)) return null;
    if (this.clip && !this.clip.contains(lon, lat)) return null;
    const i = Math.min(this.lons.length - 2, Math.max(0, upperIndex(this.lons, lon)));
    const j = Math.min(this.lats.length - 2, Math.max(0, upperIndex(this.lats, lat)));
    const corners = [
      this.cells.get(`${this.lats[j]}|${this.lons[i]}`),
      this.cells.get(`${this.lats[j]}|${this.lons[i + 1]}`),
      this.cells.get(`${this.lats[j + 1]}|${this.lons[i]}`),
      this.cells.get(`${this.lats[j + 1]}|${this.lons[i + 1]}`),
    ];
    if (corners.some((c) => c === undefined)) return null;
    const [sw, se, nw, ne] = corners as { u: number; v: number }[];
    const x = (lon - this.lons[i]) / (this.lons[i + 1] - this.lons[i]);
    const y = (lat - this.lats[j]) / (this.lats[j + 1] - this.lats[j]);
    const mix = (a: number, b: number, c: number, d: number) =>
      (a * (1 - x) + b * x) * (1 - y) + (c * (1 - x) + d * x) * y;
    const u = mix(sw.u, se.u, nw.u, ne.u);
    const v = mix(sw.v, se.v, nw.v, ne.v);
    return { u, v, speed: Math.hypot(u, v) };
  }
}

/** Index of the last value <= x in a sorted list (0 if x is below the first). */
function upperIndex(sorted: readonly number[], x: number): number {
  let low = 0;
  let high = sorted.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (sorted[mid] <= x) low = mid;
    else high = mid - 1;
  }
  return low;
}
