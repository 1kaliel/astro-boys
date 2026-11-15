import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies the API to the FastAPI backend (run it on port 8080).
// The production build is served by FastAPI from the same origin, so no proxy is needed there.
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/healthz": "http://localhost:8080",
      "/api": "http://localhost:8080",
    },
  },
});
