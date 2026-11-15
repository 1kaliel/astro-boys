import { useCallback, useEffect, useState } from "react";
import type { Period } from "../state/dashboard";

/** The map endpoint (`/api/cells`, app/backend/astro_dashboard/data.py), following docs/data-dictionary.md.
 * The calendar has its own client: data/calendarSource.ts. */
export type CellValue = { id: string; value: number; estimated: boolean; partial: boolean };

export type CellsResponse = {
  year: number;
  month: number;
  period: Period;
  model_version: string | null;
  simulated: boolean;
  /** Fixed class limits for the map, the same for every month (quantiles of all cell-months). */
  breaks?: number[];
  cells: CellValue[];
};

/** Last good data is kept while a new request runs, so views dim instead of jumping back to "loading". */
export type Remote<T> = { data: T | null; loading: boolean; error: string | null; retry: () => void };

type State<T> = Omit<Remote<T>, "retry">;

/** Waits between automatic retries when the API is down or answers 5xx (e.g. the backend is still starting). */
const RETRY_DELAYS_MS = [1000, 2000, 4000];

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** GET a JSON resource; refetches when the URL changes, aborts stale requests, retries transient failures. */
export function useRemote<T>(url: string | null): Remote<T> {
  const [state, setState] = useState<State<T>>({ data: null, loading: url !== null, error: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let tries = 0;

    const run = () => {
      setState((previous) => ({ ...previous, loading: true, error: null }));
      fetch(url, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            const body = await response.json().catch(() => null);
            throw new HttpError(body?.detail ?? `Request failed (${response.status})`, response.status);
          }
          return (await response.json()) as T;
        })
        .then((data) => setState({ data, loading: false, error: null }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          // A network error (TypeError) or a 5xx is worth retrying; a 4xx is not.
          const transient = error instanceof TypeError || (error instanceof HttpError && error.status >= 500);
          if (transient && tries < RETRY_DELAYS_MS.length) {
            timer = window.setTimeout(run, RETRY_DELAYS_MS[tries]);
            tries += 1;
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          setState((previous) => ({ data: previous.data, loading: false, error: message }));
        });
    };

    run();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [url, attempt]);

  return { ...state, retry };
}

export function cellsUrl(period: Period, selected: { year: number; month: number } | null): string {
  const params = new URLSearchParams({ period });
  if (selected) {
    params.set("year", String(selected.year));
    params.set("month", String(selected.month));
  }
  return `/api/cells?${params}`;
}
