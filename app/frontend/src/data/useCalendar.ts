import { useCallback, useEffect, useState } from "react";
import type { Bounds, Period } from "../state/dashboard";
import { loadCalendar, type CalendarDataset } from "./calendarSource";

export type CalendarLoad =
  | { status: "loading" }
  | { status: "error"; message: string }
  /** `refreshing` is true while a new area or period is loading and the previous calendar is still shown. */
  | { status: "ready"; dataset: CalendarDataset; refreshing: boolean };

/** Loads the calendar of an area and period; reloads when either changes. `reload` retries after an error. */
export function useCalendarDataset(area: Bounds, period: Period): [CalendarLoad, () => void] {
  const [load, setLoad] = useState<CalendarLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { west, south, east, north } = area;

  useEffect(() => {
    const controller = new AbortController();
    setLoad((previous) => (previous.status === "ready" ? { ...previous, refreshing: true } : { status: "loading" }));
    loadCalendar({ area: { west, south, east, north }, period }, controller.signal)
      .then((dataset) => setLoad({ status: "ready", dataset, refreshing: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return; // a newer request replaced this one
        setLoad({ status: "error", message: error instanceof Error ? error.message : "Unknown error." });
      });
    return () => controller.abort();
  }, [west, south, east, north, period, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  return [load, reload];
}
