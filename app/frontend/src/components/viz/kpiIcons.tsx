import type { ReactElement } from "react";

/** Small line icons for the KPI cards (no icon library is installed, and none is added). Decorative: the card text says it all. */
const props = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

export type KpiIconName = "activity" | "season" | "year" | "provenance";

const ICONS: Record<KpiIconName, ReactElement> = {
  // A flame: fire activity (hotspots), not an alert.
  activity: (
    <svg {...props}>
      <path d="M12 3c1 3.5-3.5 5-3.5 9.2A3.5 3.5 0 0 0 12 16a3.5 3.5 0 0 0 3.5-3.4c0-1.6-.8-2.6-1.5-3.6.2 1.2-.4 2-1.2 2.3C13.2 8.6 12.6 5.4 12 3z" />
      <path d="M8 18.5c1 1.5 2.4 2.5 4 2.5s3-1 4-2.5" />
    </svg>
  ),
  // A calendar page.
  season: (
    <svg {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  // A bar chart.
  year: (
    <svg {...props}>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </svg>
  ),
  // A stack of records: where the data comes from.
  provenance: (
    <svg {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="2.8" />
      <path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
    </svg>
  ),
};

export function KpiIcon({ name }: { name: KpiIconName }) {
  return ICONS[name];
}
