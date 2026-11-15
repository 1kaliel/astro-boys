import { describe, expect, it } from "vitest";
import { WindField, advance, windVector, type WindSample } from "./windField";

// A 2 x 2 lattice, 4 degrees apart.
const lattice = (speeds: (number | null)[], from = 90): WindSample[] =>
  [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 4 },
    { lat: 4, lon: 0 },
    { lat: 4, lon: 4 },
  ].map((p, i) => ({ ...p, wind_speed_kmh: speeds[i], wind_from_deg: speeds[i] === null ? null : from }));

describe("wind field", () => {
  it("a wind FROM the east blows toward the west (negative u); FROM the north blows south", () => {
    const east = windVector(10, 90);
    expect(east.u).toBeCloseTo(-10);
    expect(east.v).toBeCloseTo(0);
    const north = windVector(10, 0);
    expect(north.u).toBeCloseTo(0);
    expect(north.v).toBeCloseTo(-10);
    const southWest = windVector(10, 225); // from the south-west: toward the north-east
    expect(southWest.u).toBeGreaterThan(0);
    expect(southWest.v).toBeGreaterThan(0);
  });

  it("interpolates between the corners", () => {
    const field = new WindField(lattice([10, 20, 10, 20]));
    expect(field.sample(0, 0)?.speed).toBeCloseTo(10);
    expect(field.sample(4, 4)?.speed).toBeCloseTo(20);
    expect(field.sample(2, 2)?.speed).toBeCloseTo(15); // half way between 10 and 20
  });

  it("is unknown outside the lattice and where a corner has no value", () => {
    const field = new WindField(lattice([10, 20, 10, 20]));
    expect(field.sample(-1, 2)).toBeNull();
    expect(field.sample(2, 5)).toBeNull();
    expect(new WindField(lattice([10, null, 10, 20])).sample(2, 2)).toBeNull();
  });

  it("needs a full cell to be usable", () => {
    expect(new WindField([]).usable).toBe(false);
    expect(new WindField(lattice([1, 1, 1, 1])).usable).toBe(true);
  });

  it("moves a position the way the wind blows, with longitude degrees shrinking away from the equator", () => {
    const [lon, lat] = advance(0, 0, 111.32, 0, 1); // an hour of 111 km/h toward the east at the equator
    expect(lon).toBeCloseTo(1, 3);
    expect(lat).toBeCloseTo(0);
    const [lonHigh] = advance(0, 60, 111.32, 0, 1);
    expect(lonHigh).toBeGreaterThan(1.9); // about 2 degrees at 60 degrees latitude
  });
});
