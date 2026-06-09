import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildGeneratedFiles } from "./generate-theme-tokens.mjs";

const root = resolve(import.meta.dirname, "..");

describe("theme token generator", () => {
  it("generates Swift and Tailwind v4 CSS from the canonical token source", () => {
    const outputs = buildGeneratedFiles(root);

    expect(outputs.swift.path).toBe("apps/desktop/Sources/Theme/GeneratedThemeTokens.swift");
    expect(outputs.css.path).toBe("apps/thread-window-web/src/styles/generated-theme.css");
    expect(outputs.swift.content).toContain("enum GeneratedThemeTokens");
    expect(outputs.swift.content).toContain("static let light");
    expect(outputs.swift.content).toContain("static let dark");
    expect(outputs.css.content).toContain("@theme");
    expect(outputs.css.content).toContain(':root[data-theme="light"]');
    expect(outputs.css.content).toContain(':root[data-theme="dark"]');
    expect(outputs.css.content).toContain("--color-app-canvas: var(--ha-color-canvas)");
  });

  it("keeps generated files in sync with design/tokens.json", () => {
    const outputs = buildGeneratedFiles(root);
    const swift = readFileSync(resolve(root, outputs.swift.path), "utf8");
    const css = readFileSync(resolve(root, outputs.css.path), "utf8");

    expect(swift).toBe(outputs.swift.content);
    expect(css).toBe(outputs.css.content);
  });
});
