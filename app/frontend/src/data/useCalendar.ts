import { useCallback, useEffect, useState } from "react";
import { loadCalendar, type CalendarDataset } from "./calendarSource";

export type CalendarLoad =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; dataset: CalendarDataset };

/** Loads the calendar once. `reload` retries after an error. */
export function useCalendarDataset(): [CalendarLoad, () => void] {
  const [load, setLoad] = useState<CalendarLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    loadCalendar()
      .then((dataset) => {
        if (!cancelled) setLoad({ status: "ready", dataset });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: "error", message: error instanceof Error ? error.message : "Unknown error." });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  return [load, reload];
}
