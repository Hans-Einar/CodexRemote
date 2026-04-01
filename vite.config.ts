import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { DEFAULT_API_PORT, DEFAULT_VITE_PORT } from "./src/config/ports";

export const viteConfig = defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: DEFAULT_VITE_PORT,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${DEFAULT_API_PORT}`,
        changeOrigin: false,
        ws: true
      }
    }
  }
});

export default viteConfig;
