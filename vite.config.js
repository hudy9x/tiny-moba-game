import { defineConfig } from "vite";
import { gameConfig } from "./src/gameConfig.js";
export default defineConfig({
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/ws": { target: `ws://127.0.0.1:${gameConfig.network.port}`, ws: true },
    },
  },
  preview: {
    proxy: {
      "/ws": { target: `ws://127.0.0.1:${gameConfig.network.port}`, ws: true },
    },
  },
});
