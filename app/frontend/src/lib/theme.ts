export type Theme = "light" | "dark";

const STORAGE_KEY = "astro-boys-theme";

/** The viewer's saved choice, if any. Storage can be blocked (private mode): then there is no saved choice. */
export function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/** Sets data-theme on <html> (the tokens switch on it) and remembers it; null follows the OS again. */
export function applyTheme(theme: Theme | null): void {
  const root = document.documentElement;
  if (theme) root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
  try {
    if (theme) window.localStorage.setItem(STORAGE_KEY, theme);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the theme still applies for this visit.
  }
}
