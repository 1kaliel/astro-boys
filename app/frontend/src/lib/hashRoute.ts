import { useEffect, useState } from "react";

/**
 * Two screens, no router dependency: the landing page (the story) and the explorer (the tool).
 * "" / "#" / "#home" is the landing; "#explore" and any other hash is the explorer, so an old or mistyped
 * link still lands in the tool. In-page jumps on the landing must scroll in code, never set the hash.
 */
export type Route = "home" | "explore";

export function routeFromHash(hash: string): Route {
  const name = hash.replace(/^#\/?/, "").trim().toLowerCase();
  return name === "" || name === "home" ? "home" : "explore";
}

/** Back to the landing page (the explorer header can call this). */
export function goHome(): void {
  window.location.hash = "home";
}

/** Open the explorer. */
export function goExplore(): void {
  window.location.hash = "explore";
}

/** The current route; follows hashchange and scrolls to the top when the route changes. */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === "undefined" ? "home" : routeFromHash(window.location.hash),
  );
  useEffect(() => {
    const update = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [route]);
  return route;
}
