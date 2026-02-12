import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const portFromEnv = Number.parseInt(process.env.JARVIS_DEV_PORT ?? "5173", 10);
const devPort = Number.isFinite(portFromEnv) && portFromEnv > 0 ? portFromEnv : 5173;

export default defineConfig({
  root: "src/renderer",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: devPort,
    strictPort: true
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true
  }
});
