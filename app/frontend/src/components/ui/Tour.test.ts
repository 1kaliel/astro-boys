import { describe, expect, it } from "vitest";
import { TOUR_STEPS, TOUR_TARGETS, tourTarget } from "../../features/dashboard/tourSteps";
import {
  clipToViewport,
  findAvailableStep,
  markTourSeen,
  placePopover,
  readTourSeen,
  TOUR_STORAGE_KEY,
  type TourStep,
} from "./Tour";

const steps: TourStep[] = ["a", "b", "c", "d"].map((name) => ({ target: `#${name}`, title: name, body: name }));
const viewport = { width: 1280, height: 800 };
const popover = { width: 320, height: 180 };

describe("findAvailableStep", () => {
  const present = (ids: string[]) => (selector: string) => ids.includes(selector);

  it("returns the step itself when its target exists", () => {
    expect(findAvailableStep(steps, 1, 1, present(["#b"]))).toBe(1);
  });

  it("skips missing targets forward and backward", () => {
    const exists = present(["#a", "#d"]);
    expect(findAvailableStep(steps, 1, 1, exists)).toBe(3);
    expect(findAvailableStep(steps, 2, -1, exists)).toBe(0);
  });

  it("returns -1 past either end or when nothing is on the page", () => {
    expect(findAvailableStep(steps, 4, 1, present(["#a"]))).toBe(-1);
    expect(findAvailableStep(steps, -1, -1, present(["#a"]))).toBe(-1);
    expect(findAvailableStep(steps, 0, 1, present([]))).toBe(-1);
  });
});

describe("placePopover", () => {
  it("docks to the bottom on phones", () => {
    expect(placePopover({ top: 100, left: 10, width: 200, height: 40 }, popover, viewport, true)).toEqual({ kind: "dock" });
  });

  it("prefers below the target, centered and kept inside the window", () => {
    const placed = placePopover({ top: 100, left: 0, width: 100, height: 40 }, popover, viewport, false);
    expect(placed).toEqual({ kind: "side", side: "bottom", top: 152, left: 8 });
  });

  it("goes above when there is no room below", () => {
    const placed = placePopover({ top: 600, left: 500, width: 200, height: 150 }, popover, viewport, false);
    expect(placed.kind === "side" && placed.side).toBe("top");
  });

  it("goes beside a tall target, and docks when no side fits", () => {
    const tall = placePopover({ top: 20, left: 20, width: 600, height: 760 }, popover, viewport, false);
    expect(tall.kind === "side" && tall.side).toBe("right");
    expect(placePopover({ top: 4, left: 4, width: 1272, height: 792 }, popover, viewport, false)).toEqual({ kind: "dock" });
  });
});

describe("clipToViewport", () => {
  it("keeps the outline of a target taller than the window on screen", () => {
    const clipped = clipToViewport({ top: -300, left: 16, width: 600, height: 2000 }, viewport);
    expect(clipped.top).toBeGreaterThanOrEqual(0);
    expect(clipped.top + clipped.height).toBeLessThanOrEqual(viewport.height);
  });
});

describe("seen flag", () => {
  it("round-trips through storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    expect(readTourSeen(storage)).toBe(false);
    markTourSeen(storage);
    expect(store.get(TOUR_STORAGE_KEY)).toBe("1");
    expect(readTourSeen(storage)).toBe(true);
  });

  it("survives blocked storage", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readTourSeen(blocked)).toBe(false);
    expect(() => markTourSeen(blocked)).not.toThrow();
    expect(readTourSeen(null)).toBe(false);
  });
});

describe("tour steps", () => {
  it("cover every documented target once, in order", () => {
    expect(TOUR_STEPS.map((step) => step.target)).toEqual(TOUR_TARGETS.map(tourTarget));
    for (const step of TOUR_STEPS) expect(step.body.length).toBeLessThan(140);
  });
});
