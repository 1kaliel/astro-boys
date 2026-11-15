import { describe, expect, it } from "vitest";
import { PILOT_BOUNDS } from "../../state/dashboard";
import {
  FILL_FADE,
  FOCUS,
  GRID_FADE,
  L3_ZOOM_OFFSET,
  cellFillOpacity,
  cellFillOpacityExpression,
  focusActive,
  focusCellAt,
  focusZoom,
  isFocusOf,
  DATA_ANCHOR,
  labelBlockIndex,
  withDataAnchor,
  boundsCenter,
  cellPx,
  globeZoomToFit,
  gridOutlineOpacity,
  gridOutlineOpacityExpression,
  insideBounds,
  zoomForCellPx,
} from "./view";

describe("grid outline fade", () => {
  it("relates zoom and cell width", () => {
    expect(cellPx(zoomForCellPx(20))).toBeCloseTo(20, 6);
    // At zoom 6 a 0.25° cell is about 23 px wide.
    expect(cellPx(6)).toBeCloseTo(22.76, 1);
  });

  it("hides the outlines at the zoom that frames the whole study area, and shows them when cells are large", () => {
    // The pilot box framed in a 400 to 900 px map is about zoom 4 to 5.5.
    expect(gridOutlineOpacity(4.5)).toBe(0);
    expect(gridOutlineOpacity(GRID_FADE.from)).toBe(0);
    expect(gridOutlineOpacity(GRID_FADE.to)).toBeCloseTo(GRID_FADE.opacity, 6);
    expect(gridOutlineOpacity(10)).toBeCloseTo(GRID_FADE.opacity, 6);
    const mid = gridOutlineOpacity((GRID_FADE.from + GRID_FADE.to) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(GRID_FADE.opacity);
  });

  it("starts at 16 px cells and ends at 32 px cells", () => {
    expect(cellPx(GRID_FADE.from)).toBeCloseTo(16, 6);
    expect(cellPx(GRID_FADE.to)).toBeCloseTo(32, 6);
  });

  it("builds the MapLibre expression from the same stops", () => {
    expect(gridOutlineOpacityExpression()).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      GRID_FADE.from,
      0,
      GRID_FADE.to,
      GRID_FADE.opacity,
    ]);
  });
});

describe("globe view", () => {
  it("fits the whole globe in the shorter side", () => {
    const zoom = globeZoomToFit(1280, 600);
    const diameter = (512 * 2 ** zoom) / Math.PI;
    expect(diameter).toBeCloseTo(0.9 * 600, 6);
  });

  it("stays within 1 to 3", () => {
    expect(globeZoomToFit(100, 100)).toBe(1);
    expect(globeZoomToFit(10000, 10000)).toBe(3);
    expect(globeZoomToFit(0, 0)).toBe(1);
  });

  it("knows the study area's center and what is inside it", () => {
    expect(boundsCenter(PILOT_BOUNDS)).toEqual([-41.75, -9.7]);
    expect(insideBounds(-40, -8, PILOT_BOUNDS)).toBe(true);
    expect(insideBounds(-60, -8, PILOT_BOUNDS)).toBe(false);
  });
});

describe("cell fill opacity by zoom", () => {
  it("is strong at the overview and translucent once a cell is large", () => {
    // The zoom that frames the study area (~4.5 to 5.5): the colors are the message.
    expect(cellFillOpacity(4.5)).toBe(FILL_FADE.strong);
    expect(cellPx(FILL_FADE.from)).toBeCloseTo(16, 6);
    // From 256 px per cell (zoom ~9.5) the basemap reads through.
    expect(cellPx(FILL_FADE.to)).toBeCloseTo(256, 6);
    expect(cellFillOpacity(FILL_FADE.to)).toBeCloseTo(FILL_FADE.light, 6);
    expect(cellFillOpacity(12)).toBeCloseTo(FILL_FADE.light, 6);
    const z8 = cellFillOpacity(8);
    expect(z8).toBeLessThan(FILL_FADE.strong);
    expect(z8).toBeGreaterThan(FILL_FADE.light);
  });

  it("starts with the grid fade and stays readable", () => {
    expect(FILL_FADE.from).toBeCloseTo(GRID_FADE.from, 6);
    expect(FILL_FADE.light).toBeGreaterThanOrEqual(0.35);
    expect(FILL_FADE.light).toBeLessThanOrEqual(0.45);
  });

  it("shifts the ramp by 2 zoom levels for the L3 sub-cells", () => {
    expect(cellFillOpacity(7, L3_ZOOM_OFFSET)).toBeCloseTo(cellFillOpacity(5), 6);
    expect(cellFillOpacity(11.5, L3_ZOOM_OFFSET)).toBeCloseTo(FILL_FADE.light, 6);
  });

  it("builds the MapLibre expression from the same stops", () => {
    expect(cellFillOpacityExpression()).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      FILL_FADE.from,
      FILL_FADE.strong,
      FILL_FADE.to,
      FILL_FADE.light,
    ]);
    const l3 = cellFillOpacityExpression(L3_ZOOM_OFFSET);
    expect(l3[3]).toBeCloseTo(FILL_FADE.from + 2, 6);
  });

  it("dims the other cells a little when one has the focus", () => {
    const expr = cellFillOpacityExpression(0, "G083135.16");
    expect(expr.slice(0, 5)).toEqual(["interpolate", ["linear"], ["zoom"], FILL_FADE.from, FILL_FADE.strong]);
    expect(expr[5]).toBeCloseTo(focusZoom(), 6);
    expect(expr[6]).toEqual([
      "case",
      ["==", ["get", "id"], "G083135.16"],
      cellFillOpacity(focusZoom()),
      cellFillOpacity(focusZoom()) * FOCUS.dim,
    ]);
    expect(expr[8]).toEqual(["case", ["==", ["get", "id"], "G083135.16"], FILL_FADE.light, FILL_FADE.light * FOCUS.dim]);
    expect(cellFillOpacity(10, 0, true)).toBeCloseTo(FILL_FADE.light * FOCUS.dim, 6);
  });
});

describe("focus on the cell you zoom into", () => {
  it("starts when a cell is 64 px wide", () => {
    expect(cellPx(focusZoom())).toBeCloseTo(FOCUS.cellPx, 6);
    expect(focusZoom()).toBeGreaterThan(GRID_FADE.to);
    expect(focusZoom()).toBeLessThan(8);
    expect(focusActive(7)).toBe(false);
    expect(focusActive(8)).toBe(true);
    // L3 sub-cells are 4 x smaller: their focus starts 2 zoom levels later.
    expect(focusActive(8.6, L3_ZOOM_OFFSET)).toBe(false);
    expect(focusActive(10, L3_ZOOM_OFFSET)).toBe(true);
  });

  it("finds the L2 cell at a point inside the study area, nothing outside it", () => {
    // G083135.16: lat floor -7 (083 - 90), lon floor -45 (135 - 180), k 16 = north-east quarter of that degree.
    expect(focusCellAt(-44.1, -6.1, PILOT_BOUNDS, null)).toBe("G083135.16");
    expect(focusCellAt(-60, -8, PILOT_BOUNDS, null)).toBeNull();
  });

  it("finds the L3 sub-cell of the drilled cell, nothing in its neighbors", () => {
    expect(focusCellAt(-44.03, -6.03, PILOT_BOUNDS, "G083135.16")).toBe("G083135.16.16");
    expect(focusCellAt(-44.22, -6.22, PILOT_BOUNDS, "G083135.16")).toBe("G083135.16.01");
    expect(focusCellAt(-43.9, -6.1, PILOT_BOUNDS, "G083135.16")).toBeNull();
  });

  it("accepts only ids of the current level", () => {
    expect(isFocusOf("G083135.16", null)).toBe(true);
    expect(isFocusOf("G083135.16.01", null)).toBe(false);
    expect(isFocusOf("G083135.16.01", "G083135.16")).toBe(true);
    expect(isFocusOf("G083135.15.01", "G083135.16")).toBe(false);
    expect(isFocusOf("G083135.16", "G083135.16")).toBe(false);
    expect(isFocusOf(null, null)).toBe(false);
  });
});

describe("data layers under the basemap labels", () => {
  const style = {
    version: 8,
    layers: [
      { id: "background", type: "background" },
      { id: "water_name", type: "symbol" },
      { id: "roads", type: "line" },
      { id: "place_town", type: "symbol" },
      { id: "place_city", type: "symbol" },
    ],
  };

  it("goes before the trailing block of symbol layers", () => {
    expect(labelBlockIndex(style.layers)).toBe(3);
    const ids = withDataAnchor(style).layers.map((l) => l.id);
    expect(ids).toEqual(["background", "water_name", "roads", DATA_ANCHOR, "place_town", "place_city"]);
    expect(withDataAnchor(style).version).toBe(8);
  });

  it("adds one hidden anchor, also when called twice", () => {
    const twice = withDataAnchor(withDataAnchor(style));
    expect(twice.layers.filter((l) => l.id === DATA_ANCHOR)).toHaveLength(1);
    expect(twice.layers.find((l) => l.id === DATA_ANCHOR)).toMatchObject({ type: "background", layout: { visibility: "none" } });
    expect(style.layers).toHaveLength(5); // the input is not changed
  });

  it("goes on top when the style has no labels (offline fallback)", () => {
    expect(withDataAnchor({ layers: [{ id: "background", type: "background" }] }).layers.map((l) => l.id)).toEqual([
      "background",
      DATA_ANCHOR,
    ]);
    expect(labelBlockIndex([])).toBe(0);
  });
});
