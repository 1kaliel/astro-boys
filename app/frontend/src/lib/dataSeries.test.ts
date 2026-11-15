import { describe, expect, it } from "vitest";
import { dashboardReducer, type DashboardState } from "../state/dashboard";
import { dataSeriesActions, dataSeriesOf, isMixed, satelliteActions } from "./dataSeries";
import { legendBreakLabel } from "../components/viz/Legend";

const initialState = { scale: "harmonized", sensor: "harmonized", drillCell: null } as unknown as DashboardState;
const apply = (actions: ReturnType<typeof dataSeriesActions>, state = initialState) => actions.reduce(dashboardReducer, state);

describe("one data switch", () => {
  it("sets scale and layer together", () => {
    const modis = apply(dataSeriesActions("modis", "harmonized"));
    expect(modis).toMatchObject({ scale: "raw", sensor: "aqua" });
    const viirs = apply(dataSeriesActions("viirs", modis.sensor), modis);
    expect(viirs).toMatchObject({ scale: "raw", sensor: "snpp" });
    const back = apply(dataSeriesActions("harmonized", viirs.sensor), viirs);
    expect(back).toMatchObject({ scale: "harmonized", sensor: "harmonized" });
    for (const state of [modis, viirs, back]) expect(isMixed(state)).toBe(false);
  });

  it("keeps the satellite of the same family and never leaves a mixed state", () => {
    const terra = apply(satelliteActions("terra"));
    expect(terra).toMatchObject({ scale: "raw", sensor: "terra" });
    expect(apply(dataSeriesActions("modis", "terra"), terra).sensor).toBe("terra");
    expect(isMixed(terra)).toBe(false);
  });

  it("falls back to the map layer if the state is ever mixed", () => {
    expect(dataSeriesOf({ scale: "harmonized", sensor: "snpp" })).toBe("viirs");
    expect(isMixed({ scale: "harmonized", sensor: "snpp" })).toBe(true);
  });
});

describe("legend class labels", () => {
  it("are whole numbers, the last with +", () => {
    expect([2.6, 9.8, 19.2, 47.6, 92.4].map((edge, i, all) => legendBreakLabel(edge, i === all.length - 1))).toEqual([
      "3",
      "10",
      "19",
      "48",
      "92+",
    ]);
  });
});
