import { useEffect, useState } from "react";

export type ApiStatus = "checking" | "ok" | "unavailable";

export function useApiStatus(): ApiStatus {
  const [status, setStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    fetch("/healthz")
      .then((response) => (response.ok ? "ok" : "unavailable"))
      .catch(() => "unavailable" as const)
      .then((next) => {
        if (!cancelled) setStatus(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
