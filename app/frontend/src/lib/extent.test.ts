import { describe, expect, it } from "vitest";
import { EXTENTS, extentOf } from "./extent";

describe("extent", () => {
  it("is the Northeast pilot unless the build asks for Brazil", () => {
    expect(extentOf(undefined).id).toBe("northeast");
    expect(extentOf("anything").id).toBe("northeast");
    expect(extentOf("brazil").name).toBe("Brazil");
  });

  it("the Brazil box holds the Northeast box, and the pan limits hold the box", () => {
    const ne = EXTENTS.northeast.bounds;
    const br = EXTENTS.brazil.bounds;
    expect(br.west < ne.west && br.south < ne.south && br.east > ne.east && br.north > ne.north).toBe(true);
    for (const e of Object.values(EXTENTS)) {
      const [w, s, east, n] = e.limits;
      expect(w < e.bounds.west && s < e.bounds.south && east > e.bounds.east && n > e.bounds.north).toBe(true);
    }
  });
});
