import { describe, expect, it } from "vitest";
import { hotspotsCountUrl, hotspotsCsvUrl, hotspotsQuery } from "./hotspotsCsv";

const BASE = {
  area: { west: -41, south: -10, east: -40, north: -9 },
  startYear: 2013,
  endYear: 2015,
  period: "ALL" as const,
  includeAll: false,
};

describe("hotspotsCsv", () => {
  it("turns years into the first and last local solar dates", () => {
    const params = new URLSearchParams(hotspotsQuery(BASE));
    expect(params.get("start")).toBe("2013-01-01");
    expect(params.get("end")).toBe("2015-12-31");
    expect(params.get("west")).toBe("-41");
    expect(params.get("period")).toBe("ALL");
  });

  it("asks for every detection only when told to", () => {
    expect(new URLSearchParams(hotspotsQuery(BASE)).has("include_all")).toBe(false);
    expect(new URLSearchParams(hotspotsQuery({ ...BASE, includeAll: true })).get("include_all")).toBe("true");
  });

  it("uses the same query for the count and the file", () => {
    const query = hotspotsQuery({ ...BASE, period: "N" });
    expect(hotspotsCountUrl({ ...BASE, period: "N" })).toBe(`/api/hotspots/count?${query}`);
    expect(hotspotsCsvUrl({ ...BASE, period: "N" })).toBe(`/api/hotspots.csv?${query}`);
  });
});
