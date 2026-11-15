import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, cellsUrl, drilldownUrl, fetchDrilldown, type DrilldownResponse } from "./api";

/** The fixed contract of GET /api/drilldown (task D11), mocked: the backend is built in parallel. */
const SAMPLE: DrilldownResponse = {
  cell: "G080140.06",
  year: 2013,
  month: 9,
  period: "ALL",
  satellite: "SNPP",
  instrument: "VIIRS",
  min_detections: 5,
  subdivided: true,
  neighbors: [
    { id: "G080140.01", count: 3 },
    { id: "G080140.06", count: 12 },
  ],
  l3: [
    { id: "G080140.06.01", count: 9 },
    { id: "G080140.06.16", count: 3 },
  ],
  total: 12,
};

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("drill-down client", () => {
  it("builds the URL with the cell, the month and the period the map uses", () => {
    expect(drilldownUrl({ cell: "G080140.06", year: 2013, month: 9, period: "N" })).toBe(
      "/api/drilldown?cell=G080140.06&year=2013&month=9&period=N",
    );
  });

  it("returns the parsed answer", async () => {
    const fetchMock = mockFetch(200, SAMPLE);
    await expect(fetchDrilldown({ cell: "G080140.06", year: 2013, month: 9, period: "ALL" })).resolves.toEqual(SAMPLE);
    expect(fetchMock).toHaveBeenCalledWith("/api/drilldown?cell=G080140.06&year=2013&month=9&period=ALL", {
      signal: undefined,
    });
  });

  it("throws an ApiError with the status and the API's detail (503: detections unavailable)", async () => {
    mockFetch(503, { detail: "hotspots/v1 is unavailable" });
    const error = await fetchDrilldown({ cell: "G080140.06", year: 2013, month: 9, period: "ALL" }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(503);
    expect(error.message).toBe("hotspots/v1 is unavailable");
  });

  it("falls back to a generic message when the error body is not a string detail (422 validation list)", async () => {
    mockFetch(422, { detail: [{ loc: ["query", "cell"], msg: "bad id" }] });
    const error = await fetchDrilldown({ cell: "nope", year: 2013, month: 9, period: "ALL" }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.message).toBe("The drill-down API answered 422.");
  });
});

describe("native-detection filters in the drill-down URL", () => {
  const base = { cell: "G083135.16", year: 2020, month: 9, period: "ALL" as const };

  it("leaves the defaults out", () => {
    expect(drilldownUrl({ ...base, minFrp: 0, relevance: "l" })).toBe(drilldownUrl(base));
    expect(drilldownUrl(base)).not.toContain("min_");
  });

  it("sends the intensity and relevance floors", () => {
    const url = drilldownUrl({ ...base, minFrp: 50, relevance: "h" });
    expect(url).toContain("min_frp=50");
    expect(url).toContain("min_confidence=h");
  });
});

describe("map layer in the URLs", () => {
  it("leaves the harmonized layer out and names a native satellite", () => {
    expect(cellsUrl("ALL", null)).toBe("/api/cells?period=ALL");
    expect(cellsUrl("D", { year: 2020, month: 9 }, "snpp")).toContain("sensor=snpp");
    expect(drilldownUrl({ cell: "G083135.16", year: 2020, month: 9, period: "ALL", sensor: "harmonized" })).not.toContain("sensor");
    expect(drilldownUrl({ cell: "G083135.16", year: 2020, month: 9, period: "ALL", sensor: "aqua" })).toContain("sensor=aqua");
  });
});
