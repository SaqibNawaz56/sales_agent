import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    // File events do not cross the Windows -> WSL2 bind mount reliably, so
    // without polling an edit often never triggers a reload. Costs some idle
    // CPU; the alternative is editing and wondering why nothing happened.
    watch: { usePolling: true, interval: 300 },
    proxy: {
      // The browser talks to the Vite dev server on localhost; this forwards
      // API calls across the compose network, so the app needs no knowledge of
      // where the API lives and there is no CORS to configure.
      "/api": {
        target: process.env.API_URL ?? "http://api:3000",
        changeOrigin: true,
      },
    },
  },
});
