import { describe, expect, it } from "vitest";

// Tailwind config is intentionally JavaScript in this package.
// @ts-expect-error no declaration file is needed for this config-only import
import tailwindConfig from "../tailwind.config.js";

const colors = tailwindConfig.theme.extend.colors;

describe("ThreadWindow Claude design tokens", () => {
  it("maps the warm canvas, coral primary, and dark product surfaces from DESIGN.md", () => {
    expect(colors.canvas).toBe("#faf9f5");
    expect(colors.primary.DEFAULT).toBe("#cc785c");
    expect(colors["surface-dark"]).toBe("#181715");
    expect(colors.ink).toBe("#141413");
  });
});
