import { useEffect, useState } from "react";

/** Tracks a CSS media query, e.g. "(max-width: 56rem)". */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export type ColorScheme = "light" | "dark";

/** Effective theme: an explicit data-theme on <html> wins, otherwise the OS setting. */
export function useColorScheme(): ColorScheme {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [explicit, setExplicit] = useState<string | null>(() =>
    typeof document === "undefined" ? null : document.documentElement.getAttribute("data-theme"),
  );
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setExplicit(root.getAttribute("data-theme")));
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  if (explicit === "light" || explicit === "dark") return explicit;
  return prefersDark ? "dark" : "light";
}

/** Resolved values of CSS custom properties (MapLibre cannot read var() itself). */
export function readTokens<T extends string>(names: readonly T[]): Record<T, string> {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()])) as Record<T, string>;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
