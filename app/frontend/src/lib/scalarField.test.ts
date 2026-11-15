import { describe, expect, it } from "vitest";
import { ScalarField, mercatorLat, mercatorY, type ScalarSample } from "./scalarField";
import { SURFACE_BREAKS, classOf } from "./thermalSurface";

// A 2 x 2 lattice, 3 degrees apart: 20 and 30 degrees on the west and east columns.
const lattice = (values: (number | null)[]): ScalarSample[] =>
  [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 3 },
    { lat: 3, lon: 0 },
    { lat: 3, lon: 3 },
  ].map((p, i) => ({ ...p, value: values[i] }));

describe("scalar field", () => {
  it("returns the value at a sample and interpolates between samples", () => {
    const field = new ScalarField(lattice([20, 30, 20, 30]));
    expect(field.sample(0, 0)).toBeCloseTo(20);
    expect(field.sample(3, 3)).toBeCloseTo(30);
    expect(field.sample(1.5, 1.5)).toBeCloseTo(25); // half way between 20 and 30
  });

  it("is unknown outside the lattice and where a corner has no value: nothing is invented", () => {
    const field = new ScalarField(lattice([20, 30, 20, 30]));
    expect(field.sample(-0.1, 1)).toBeNull();
    expect(field.sample(1, 3.1)).toBeNull();
    expect(new ScalarField(lattice([20, null, 20, 30])).sample(1.5, 1.5)).toBeNull();
  });

  it("a real zero is a value, not a gap", () => {
    expect(new ScalarField(lattice([0, 0, 0, 0])).sample(1, 1)).toBe(0);
  });

  it("needs a full cell to be usable", () => {
    expect(new ScalarField([]).usable).toBe(false);
    expect(new ScalarField(lattice([1, 1, 1, 1])).usable).toBe(true);
  });

  it("converts between latitude and Web Mercator y both ways, with the equator in the middle", () => {
    expect(mercatorY(0)).toBeCloseTo(0.5);
    for (const lat of [-35, -10, 0, 8, 45]) expect(mercatorLat(mercatorY(lat))).toBeCloseTo(lat, 6);
    expect(mercatorY(8)).toBeLessThan(mercatorY(-35)); // north is smaller y
  });
});

describe("temperature classes", () => {
  it("a value takes the first class whose limit it is below, the limit itself going up", () => {
    expect(classOf(5, SURFACE_BREAKS)).toBe(0);
    expect(classOf(12, SURFACE_BREAKS)).toBe(1);
    expect(classOf(27.9, SURFACE_BREAKS)).toBe(4);
    expect(classOf(32, SURFACE_BREAKS)).toBe(6);
    expect(classOf(45, SURFACE_BREAKS)).toBe(6);
  });

  it("the limits are strictly increasing", () => {
    expect([...SURFACE_BREAKS].every((v, i, a) => i === 0 || v > a[i - 1])).toBe(true);
  });
});
