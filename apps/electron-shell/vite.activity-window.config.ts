import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  root: "src/activity-window",
  plugins: [react()],
  build: {
    outDir: "../../dist/activity-window",
    emptyOutDir: true,
  },
});
