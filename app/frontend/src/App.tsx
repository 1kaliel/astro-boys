import { useEffect, useState } from "react";

type ApiStatus = "checking" | "ok" | "unavailable";

// Skeleton only: the map (D3) and the calendar (D4) replace the placeholder below.
export function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    fetch("/healthz")
      .then((response) => (response.ok ? "ok" : "unavailable"))
      .catch(() => "unavailable" as const)
      .then((status) => {
        if (!cancelled) setApiStatus(status);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const statusText = {
    checking: "Checking API…",
    ok: "API connected",
    unavailable: "API unavailable",
  }[apiStatus];

  return (
    <div className="page">
      <header className="header">
        <h1>Hotspot calendar: Northeast Brazil</h1>
        <p className="subtitle">Harmonized MODIS and VIIRS active-fire hotspots, 2003 to present</p>
        <p className="status" role="status" aria-live="polite">
          {statusText}
        </p>
      </header>

      <main className="placeholder" aria-label="Map and calendar">
        <p>The map and the burning calendar will appear here.</p>
      </main>

      <footer className="footer">
        <p>
          <strong>What this shows:</strong> hotspots are satellite thermal detections. They are not confirmed
          fires and not burned area. Estimates for years before 2012 carry extra uncertainty.
        </p>
        <p>
          Data: NASA FIRMS (MODIS and VIIRS active fire products). This prototype is exploratory and must not
          be used for emergency or resource decisions.
        </p>
      </footer>
    </div>
  );
}
