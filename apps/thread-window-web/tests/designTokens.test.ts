import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const generatedCss = readFileSync(resolve(import.meta.dirname, "../src/styles/generated-theme.css"), "utf8");

describe("ThreadWindow generated theme tokens", () => {
  it("uses Tailwind v4 CSS-first app tokens", () => {
    expect(generatedCss).toContain("@theme");
    expect(generatedCss).toContain("--color-app-canvas: var(--ha-color-canvas)");
    expect(generatedCss).toContain("--color-app-text-primary: var(--ha-color-text-primary)");
    expect(generatedCss).toContain(':root[data-theme="light"]');
    expect(generatedCss).toContain(':root[data-theme="dark"]');
  });
});
