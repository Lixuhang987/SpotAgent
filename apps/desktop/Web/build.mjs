import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("dist", { recursive: true });

await build({
  entryPoints: ["main.tsx"],
  bundle: true,
  format: "iife",
  platform: "browser",
  nodePaths: ["node_modules"],
  target: ["safari15"],
  outfile: "dist/app.js",
  jsx: "automatic",
  sourcemap: false,
});
