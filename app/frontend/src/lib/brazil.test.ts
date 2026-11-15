import { describe, expect, it } from "vitest";
import { contains, loadBrazil, outlineFromGeometry } from "./brazil";

describe("outline of Brazil", () => {
  it("contains cities of every region and leaves out the ocean and the neighbors", async () => {
    const brazil = await loadBrazil();
    // Brasília, Fortaleza, Recife, Manaus, Porto Alegre, Boa Vista
    for (const [lon, lat] of [
      [-47.88, -15.79],
      [-38.54, -3.73],
      [-34.88, -8.05],
      [-60.02, -3.12],
      [-51.23, -30.03],
      [-60.67, 2.82],
    ])
      expect(contains(brazil, lon, lat)).toBe(true);
    // Atlantic off Bahia, Montevideo, Asunción, Lima, Caracas
    for (const [lon, lat] of [
      [-33.0, -14.0],
      [-56.16, -34.9],
      [-57.58, -25.26],
      [-77.04, -12.05],
      [-66.9, 10.48],
    ])
      expect(contains(brazil, lon, lat)).toBe(false);
  });

  it("has the bounding box of the country", async () => {
    const { bounds } = await loadBrazil();
    expect(bounds.west).toBeCloseTo(-74, 0);
    expect(bounds.north).toBeCloseTo(5.3, 0);
    expect(bounds.south).toBeCloseTo(-33.7, 0);
    expect(bounds.east).toBeGreaterThan(-35); // the mainland ends at -34.8; islands go farther
  });

  it("leaves out the holes of a polygon", () => {
    const square = (w: number, s: number, e: number, n: number) => [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
      [w, s],
    ];
    const donut = outlineFromGeometry({ type: "Polygon", coordinates: [square(0, 0, 10, 10), square(4, 4, 6, 6)] });
    expect(contains(donut, 2, 2)).toBe(true);
    expect(contains(donut, 5, 5)).toBe(false);
    expect(contains(donut, 11, 5)).toBe(false);
  });
});
