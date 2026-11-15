import { ScalarField, mercatorLat, mercatorY, type ScalarSample } from "./scalarField";

/** Fixed classes of the live temperature surface (°C): the same at any hour, so two moments can be compared by eye. */
export const SURFACE_BREAKS = [12, 16, 20, 24, 28, 32] as const;

/** Class (0 = coldest ... breaks.length = warmest) of a value: the first limit it is below. */
export function classOf(value: number, breaks: readonly number[]): number {
  let cls = 0;
  while (cls < breaks.length && value >= breaks[cls]) cls += 1;
  return cls;
}

export type SurfaceImage = {
  /** PNG data URL of the surface, drawn so that MapLibre can place it on the map by its four corners. */
  url: string;
  /** [west, north], [east, north], [east, south], [west, south]: the order of a MapLibre image source. */
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
};

/**
 * The surface of the sampled temperatures as a classed image over the lattice region. Rows follow the Web Mercator
 * spacing, so the image sits correctly on the map. Between the points the value is a bilinear interpolation of the
 * samples (the legend says so); where the field is unknown the pixel stays transparent. `colors` has one CSS color per
 * class, coldest first. Needs a canvas, so it only runs in a browser.
 */
export function renderThermalSurface(
  points: readonly ScalarSample[],
  colors: readonly string[],
  breaks: readonly number[] = SURFACE_BREAKS,
  pixelsPerDegree = 8,
): SurfaceImage | null {
  const field = new ScalarField(points);
  if (!field.usable || colors.length !== breaks.length + 1) return null;
  const width = Math.max(2, Math.round((field.east - field.west) * pixelsPerDegree));
  const yTop = mercatorY(field.north);
  const yBottom = mercatorY(field.south);
  // Square pixels in Web Mercator space: the world is 360 degrees wide and 1 tall in these units.
  const height = Math.max(2, Math.round((width * (yBottom - yTop)) / ((field.east - field.west) / 360)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const palette = colors.map((css) => {
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as const;
  });
  const image = ctx.createImageData(width, height);
  for (let row = 0; row < height; row += 1) {
    const lat = mercatorLat(yTop + ((row + 0.5) / height) * (yBottom - yTop));
    for (let col = 0; col < width; col += 1) {
      const lon = field.west + ((col + 0.5) / width) * (field.east - field.west);
      const value = field.sample(lon, lat);
      const offset = (row * width + col) * 4;
      if (value === null) continue; // unknown: transparent, never a color
      const [r, g, b] = palette[classOf(value, breaks)];
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return {
    url: canvas.toDataURL("image/png"),
    coordinates: [
      [field.west, field.north],
      [field.east, field.north],
      [field.east, field.south],
      [field.west, field.south],
    ],
  };
}
