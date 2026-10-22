import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, target: "safari16" },
  server: { port: 1420, strictPort: true },
  clearScreen: false
});
