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

/** An API answer that is not 2xx; `status` lets the UI word a 503 ("unavailable right now") differently. */
export class ApiError extends Error {
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
            throw new ApiError(body?.detail ?? `Request failed (${response.status})`, response.status);
          }
          return (await response.json()) as T;
        })
        .then((data) => setState({ data, loading: false, error: null }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          // A network error (TypeError) or a 5xx is worth retrying; a 4xx is not.
          const transient = error instanceof TypeError || (error instanceof ApiError && error.status >= 500);
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

// ---------------------------------------------------------------------------------------------------------
// The L3 drill-down (task D11): GET /api/drilldown, native detections of one month's source satellite.

export type DrillCount = { id: string; count: number };

/** Native detections around one L2 cell. Not harmonized: one satellite, never MODIS and VIIRS added together. */
export type DrilldownResponse = {
  cell: string;
  year: number;
  month: number;
  period: Period;
  /** The month's source satellite (Aqua before the VIIRS era, S-NPP after) and its instrument. */
  satellite: string;
  instrument: string;
  /** Stop rule: a cell with fewer native detections than this is not subdivided. */
  min_detections: number;
  subdivided: boolean;
  /** The 3 x 3 block of L2 cells (the target and its 8 neighbors), native counts. */
  neighbors: DrillCount[];
  /** L3 cells of the target with at least one detection; empty when not subdivided. */
  l3: DrillCount[];
  total: number;
};

export type DrilldownRequest = { cell: string; year: number; month: number; period: Period };

export function drilldownUrl({ cell, year, month, period }: DrilldownRequest): string {
  const params = new URLSearchParams({ cell, year: String(year), month: String(month), period });
  return `/api/drilldown?${params}`;
}

/** GET /api/drilldown. Throws ApiError on a non-2xx answer (422 bad cell or month, 503 detections unreadable). */
export async function fetchDrilldown(request: DrilldownRequest, signal?: AbortSignal): Promise<DrilldownResponse> {
  const response = await fetch(drilldownUrl(request), { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : `The drill-down API answered ${response.status}.`;
    throw new ApiError(detail, response.status);
  }
  return (await response.json()) as DrilldownResponse;
}
