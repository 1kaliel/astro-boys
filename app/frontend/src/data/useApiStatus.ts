import { useEffect, useState } from "react";

export type ApiStatus = "checking" | "ok" | "unavailable";

const POLL_MS = 5000;

/** Checks /healthz, and keeps checking every 5 s while the API is down (e.g. the backend is still starting). */
export function useApiStatus(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const check = () => {
      fetch("/healthz")
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
