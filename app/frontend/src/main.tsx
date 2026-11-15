import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { App } from "./App";
import { applyTheme, storedTheme } from "./lib/theme";

// Theme before the first render (no flash): ?theme=light|dark in the URL (screenshots, demo) wins for this visit
// without being saved; otherwise a saved choice; otherwise the OS setting.
const fromUrl = new URLSearchParams(window.location.search).get("theme");
if (fromUrl === "light" || fromUrl === "dark") {
  document.documentElement.setAttribute("data-theme", fromUrl);
} else {
  const saved = storedTheme();
  if (saved) applyTheme(saved);
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element in index.html");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
