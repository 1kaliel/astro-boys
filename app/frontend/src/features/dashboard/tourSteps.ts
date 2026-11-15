import type { TourStep } from "../../components/ui/Tour";

/** `[data-tour="name"]`: the page marks each part the guide points at with this attribute. */
export const tourTarget = (name: TourTargetName) => `[data-tour="${name}"]`;

export const TOUR_TARGETS = ["filters", "kpis", "calendar", "map", "coords", "charts", "help"] as const;
export type TourTargetName = (typeof TOUR_TARGETS)[number];

/**
 * The Guide teaches how to USE the dashboard (move around, filter, pick dates). What the numbers mean lives in
 * "Understand the data"; keep the two apart. Plain words, one idea per step.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: tourTarget("filters"),
    title: "Choose what to look at",
    body: "These filters set the area, the years and the time of day. Every number, map and chart below follows them.",
  },
  {
    target: tourTarget("kpis"),
    title: "The key numbers",
    body: "A quick summary for your filters. Open a card to see the months behind its number.",
  },
  {
    target: tourTarget("calendar"),
    title: "Pick a month, then a day",
    body: "One row per year, one square per month. Click a month to see its days, then click a day to see the satellite passes.",
  },
  {
    target: tourTarget("map"),
    title: "Explore the map",
    body: "Switch layers, or flat map and globe. Draw a box to set your area, or click a cell to look inside it.",
  },
  {
    target: tourTarget("coords"),
    title: "Go to a place",
    body: "Know the coordinates? Type a latitude and longitude to jump straight to that spot.",
  },
  {
    target: tourTarget("charts"),
    title: "See the patterns",
    body: "The charts show the usual season and the long-term trend for your area. Each one has a table view.",
  },
  {
    target: tourTarget("help"),
    title: "Help is always here",
    body: "Run this guide again any time. \"Understand the data\" explains what the numbers mean and their limits.",
  },
];
