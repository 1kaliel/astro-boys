import { useEffect, useState } from "react";

export type ApiStatus = "checking" | "ok" | "unavailable";

const POLL_MS = 5000;

/**
 * Checks /api/healthz, and keeps checking every 5 s while the API is down (e.g. the backend is still starting).
 * Not /healthz: on a run.app URL Cloud Run keeps that path for itself and answers 404.
 */
export function useApiStatus(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const check = () => {
      fetch("/api/healthz")
        .then((response) => (response.ok ? "ok" : "unavailable"))
        .catch(() => "unavailable" as const)
        .then((next) => {
          if (cancelled) return;
          setStatus(next);
          if (next !== "ok") timer = window.setTimeout(check, POLL_MS);
        });
    };
    check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return status;
}
