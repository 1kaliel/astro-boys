/**
 * A scalar field (temperature) on the regular lattice of the sampled points, read by bilinear interpolation: the same
 * lattice and the same rule as the wind field, so the surface and the streaks never disagree about where data is.
 * Outside the lattice, or where a corner has no value, the field is unknown (null): nothing is invented there.
 */
export type ScalarSample = { lat: number; lon: number; value: number | null };

export class ScalarField {
  readonly lons: number[];
  readonly lats: number[];
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
  private readonly values = new Map<string, number>();

  constructor(points: readonly ScalarSample[]) {
    const lons = new Set<number>();
    const lats = new Set<number>();
    for (const p of points) {
      lons.add(p.lon);
      lats.add(p.lat);
      if (p.value !== null) this.values.set(`${p.lat}|${p.lon}`, p.value);
    }
    this.lons = [...lons].sort((a, b) => a - b);
    this.lats = [...lats].sort((a, b) => a - b);
    this.west = this.lons[0] ?? 0;
    this.east = this.lons.at(-1) ?? 0;
    this.south = this.lats[0] ?? 0;
    this.north = this.lats.at(-1) ?? 0;
  }

  /** The lattice has at least one full cell. */
  get usable(): boolean {
    return this.lons.length >= 2 && this.lats.length >= 2;
  }

  sample(lon: number, lat: number): number | null {
    if (!this.usable || lon < this.west || lon > this.east || lat < this.south || lat > this.north) return null;
    const i = Math.min(this.lons.length - 2, Math.max(0, lastAtOrBelow(this.lons, lon)));
    const j = Math.min(this.lats.length - 2, Math.max(0, lastAtOrBelow(this.lats, lat)));
    const sw = this.values.get(`${this.lats[j]}|${this.lons[i]}`);
    const se = this.values.get(`${this.lats[j]}|${this.lons[i + 1]}`);
    const nw = this.values.get(`${this.lats[j + 1]}|${this.lons[i]}`);
    const ne = this.values.get(`${this.lats[j + 1]}|${this.lons[i + 1]}`);
    if (sw === undefined || se === undefined || nw === undefined || ne === undefined) return null;
    const x = (lon - this.lons[i]) / (this.lons[i + 1] - this.lons[i]);
    const y = (lat - this.lats[j]) / (this.lats[j + 1] - this.lats[j]);
    return (sw * (1 - x) + se * x) * (1 - y) + (nw * (1 - x) + ne * x) * y;
  }
}

function lastAtOrBelow(sorted: readonly number[], x: number): number {
  let low = 0;
  let high = sorted.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (sorted[mid] <= x) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** Latitude (degrees) of a Web Mercator y in [0, 1] (0 = north edge of the map, 1 = south edge). */
export function mercatorLat(y: number): number {
  const n = Math.PI * (1 - 2 * y);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** The Web Mercator y in [0, 1] of a latitude: the inverse of mercatorLat. */
export function mercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}
