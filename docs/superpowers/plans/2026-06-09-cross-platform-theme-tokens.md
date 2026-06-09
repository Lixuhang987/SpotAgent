# Cross-Platform Theme Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one destructive replacement for the current hand-written Swift and Tailwind token systems, with generated cross-platform tokens, Tailwind v4, and Swift-hosted `light / dark / system` theme sync into Electron/React.

**Architecture:** `design/tokens.json` is the only token source. A Node generator writes Swift and CSS generated artifacts before app/frontend startup. Swift stores theme preference in `~/.spotAgent/settings.json`, resolves `system` to `light` or `dark`, sends `theme.changed` commands to Electron, and React applies `data-theme` from preload/subscription events.

**Tech Stack:** SwiftUI Observation, UserDefaults-independent JSON settings via `AgentSettingsStore`, Electron command socket, Electron preload with context isolation, React 19, Tailwind CSS v4, Vite, Vitest, XCTest, deterministic Node token generation.

---

## File Structure

Create:

- `design/tokens.json`: canonical token source.
- `scripts/generate-theme-tokens.mjs`: deterministic token generator.
- `scripts/generate-theme-tokens.test.mjs`: Node test for generator drift and output shape.
- `apps/desktop/Sources/Theme/GeneratedThemeTokens.swift`: generated Swift token constants.
- `apps/thread-window-web/src/styles/generated-theme.css`: generated Tailwind v4 theme variables.
- `apps/desktop/Sources/AppServices/Appearance/AppearanceTheme.swift`: preference/resolved theme model.
- `apps/desktop/Sources/AppServices/Appearance/AppearanceThemeService.swift`: resolves system appearance and notifies Electron.
- `apps/desktop/Sources/AppServices/Appearance/appearance.md`: module docs.
- `apps/desktop/Sources/Settings/AppearanceSettingsView.swift`: Settings UI for theme picker.
- `apps/desktop/Sources/Settings/AppearanceSettingsViewModel.swift`: Settings ViewModel proxy.
- `apps/thread-window-web/src/native/themeConfig.ts`: React-side theme config and DOM application.
- `apps/thread-window-web/tests/themeConfig.test.ts`: React theme tests.

Modify:

- `package.json`: add token generation/test scripts.
- `scripts/test.sh`: include token generator test.
- `scripts/swiftw`: run token generator before desktop run builds.
- `apps/thread-window-web/package.json`: upgrade Tailwind to v4, add `@tailwindcss/vite`, wire dev/build to token generation.
- `apps/thread-window-web/vite.config.ts`: add Tailwind v4 Vite plugin.
- `apps/thread-window-web/src/styles/tailwind.css`: switch to CSS-first Tailwind v4 entry.
- `apps/thread-window-web/src/App.tsx` and components under `apps/thread-window-web/src/components/`: replace old v3 token classes with generated v4 semantic classes.
- `apps/thread-window-web/tests/designTokens.test.ts`: replace Tailwind config assertions with generated CSS assertions.
- `apps/desktop/Sources/Theme/AppTheme.swift`: consume generated Swift tokens instead of hand-written color literals.
- `apps/desktop/Sources/Theme/theme.md`: document generated-token source.
- `apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsStore.swift`: persist `appearance`.
- `apps/desktop/Sources/AppServices/AppServices.swift`: own and inject appearance service.
- `apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift`: pass appearance ViewModel into Settings.
- `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift`: add `theme.changed`.
- `apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift`: expose `sendThemeChanged`.
- `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md`: document command.
- `apps/desktop/Sources/Coordinator/AppCoordinator.swift`: inject current theme and route theme updates.
- `apps/desktop/Sources/Coordinator/SettingsLifecycle.swift`: pass appearance ViewModel.
- `apps/desktop/Sources/Settings/SettingsStyles.swift`: add appearance tab.
- `apps/desktop/Sources/Settings/SettingsView.swift`: render appearance tab.
- `apps/electron-shell/src/main/protocol/electronShellProtocol.ts`: add theme command type guard.
- `apps/electron-shell/src/main/electronShellRuntime.ts`: route theme changes.
- `apps/electron-shell/src/main/windows/threadWindowPrewarmer.ts`: keep and broadcast theme state.
- `apps/electron-shell/src/preload/threadWindowPreload.ts`: expose initial theme and subscription API.
- `apps/electron-shell/tests/**/*.test.ts`: extend protocol/runtime/preload/window tests.
- `handAgent.md`, `apps/apps.md`, `apps/desktop/desktop.md`, `apps/electron-shell/electron-shell.md`, `apps/electron-shell/src/preload/preload.md`, `apps/thread-window-web/thread-window-web.md`, `docs/manual-qa.md`: update docs.

Delete:

- `apps/thread-window-web/tailwind.config.js`: remove Tailwind v3 config.

---

### Task 1: Token Source And Generator

**Files:**
- Create: `design/tokens.json`
- Create: `scripts/generate-theme-tokens.mjs`
- Create: `scripts/generate-theme-tokens.test.mjs`
- Create: `apps/desktop/Sources/Theme/GeneratedThemeTokens.swift`
- Create: `apps/thread-window-web/src/styles/generated-theme.css`
- Modify: `package.json`
- Modify: `scripts/test.sh`

- [ ] **Step 1: Write the failing generator test**

Create `scripts/generate-theme-tokens.test.mjs` with this content:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run scripts/generate-theme-tokens.test.mjs
```

Expected: FAIL because `scripts/generate-theme-tokens.mjs` does not exist.

- [ ] **Step 3: Add canonical tokens**

Create `design/tokens.json` with this initial token set:

```json
{
  "color": {
    "light": {
      "canvas": "#faf9f5",
      "surface": "#efe9de",
      "surfaceSoft": "#f5f0e8",
      "surfaceElevated": "#ffffff",
      "surfaceMuted": "#e8e0d2",
      "hairline": "#e6dfd8",
      "hairlineSoft": "#ebe6df",
      "textPrimary": "#141413",
      "textSecondary": "#6c6a64",
      "textMuted": "#8e8b82",
      "accent": "#cc785c",
      "accentHover": "#a9583e",
      "accentPressed": "#8f4731",
      "accentSubtle": "rgba(204, 120, 92, 0.14)",
      "accentRing": "rgba(204, 120, 92, 0.28)",
      "onAccent": "#ffffff",
      "success": "#5db872",
      "warning": "#d4a017",
      "error": "#c64545",
      "teal": "#5db8a6",
      "amber": "#e8a55a",
      "userBubble": "#f5e7de",
      "assistantBubble": "transparent",
      "toolBubble": "#f3eee6"
    },
    "dark": {
      "canvas": "#181715",
      "surface": "#1f1e1b",
      "surfaceSoft": "#252320",
      "surfaceElevated": "#2d2a26",
      "surfaceMuted": "#363229",
      "hairline": "rgba(250, 249, 245, 0.12)",
      "hairlineSoft": "rgba(250, 249, 245, 0.08)",
      "textPrimary": "#faf9f5",
      "textSecondary": "#c7c1b8",
      "textMuted": "#a09d96",
      "accent": "#d88a6d",
      "accentHover": "#e49b7f",
      "accentPressed": "#b7654c",
      "accentSubtle": "rgba(216, 138, 109, 0.18)",
      "accentRing": "rgba(216, 138, 109, 0.36)",
      "onAccent": "#141413",
      "success": "#70c987",
      "warning": "#e4b44c",
      "error": "#e16868",
      "teal": "#75cab9",
      "amber": "#efb66e",
      "userBubble": "#302821",
      "assistantBubble": "transparent",
      "toolBubble": "#252320"
    }
  },
  "spacing": {
    "xxs": "4px",
    "xs": "8px",
    "sm": "12px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px",
    "xxl": "48px",
    "section": "96px"
  },
  "radius": {
    "xs": "4px",
    "sm": "6px",
    "md": "8px",
    "lg": "12px",
    "xl": "16px",
    "pill": "24px",
    "bubble": "12px"
  },
  "typography": {
    "displayFamily": "\"Tiempos Headline\", \"Cormorant Garamond\", \"EB Garamond\", Garamond, \"Times New Roman\", serif",
    "bodyFamily": "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
    "codeFamily": "\"JetBrains Mono\", ui-monospace, SFMono-Regular, Menlo, monospace",
    "titleSize": "18px",
    "bodySize": "15px",
    "captionSize": "13px",
    "promptInputSize": "16px"
  },
  "shadow": {
    "soft": "0 1px 3px rgba(20, 20, 19, 0.08)",
    "productInner": "inset 0 1px 0 rgba(250, 249, 245, 0.08)"
  },
  "animation": {
    "springDuration": "0.35s",
    "springBounce": "0.2",
    "highlightDuration": "0.15s"
  }
}
```

- [ ] **Step 4: Implement the generator**

Create `scripts/generate-theme-tokens.mjs` with this complete content:

```js
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootFromScript = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function buildGeneratedFiles(root = rootFromScript) {
  const tokens = JSON.parse(readFileSync(resolve(root, "design/tokens.json"), "utf8"));
  return {
    swift: {
      path: "apps/desktop/Sources/Theme/GeneratedThemeTokens.swift",
      content: buildSwift(tokens),
    },
    css: {
      path: "apps/thread-window-web/src/styles/generated-theme.css",
      content: buildCss(tokens),
    },
  };
}

export function writeGeneratedFiles(root = rootFromScript) {
  const outputs = buildGeneratedFiles(root);
  for (const output of Object.values(outputs)) {
    writeFileSync(resolve(root, output.path), output.content);
  }
}

function buildSwift(tokens) {
  return `// Generated by scripts/generate-theme-tokens.mjs. Do not edit by hand.
import SwiftUI

enum GeneratedThemeTokens {
    struct ColorSet: Sendable {
${swiftStructFields(tokens.color.light, "String")}
    }

    struct Spacing: Sendable {
${swiftStructFields(tokens.spacing, "CGFloat")}
    }

    struct Radius: Sendable {
${swiftStructFields(tokens.radius, "CGFloat")}
    }

    struct Typography: Sendable {
        let displayFamily: String
        let bodyFamily: String
        let codeFamily: String
        let titleSize: CGFloat
        let bodySize: CGFloat
        let captionSize: CGFloat
        let promptInputSize: CGFloat
    }

    struct Animation: Sendable {
        let springDuration: Double
        let springBounce: Double
        let highlightDuration: Double
    }

    static let light = ColorSet(
${swiftInitializer(tokens.color.light, swiftStringLiteral)}
    )

    static let dark = ColorSet(
${swiftInitializer(tokens.color.dark, swiftStringLiteral)}
    )

    static let spacing = Spacing(
${swiftInitializer(tokens.spacing, swiftPxLiteral)}
    )

    static let radius = Radius(
${swiftInitializer(tokens.radius, swiftPxLiteral)}
    )

    static let typography = Typography(
        displayFamily: ${swiftStringLiteral(tokens.typography.displayFamily)},
        bodyFamily: ${swiftStringLiteral(tokens.typography.bodyFamily)},
        codeFamily: ${swiftStringLiteral(tokens.typography.codeFamily)},
        titleSize: ${swiftPxLiteral(tokens.typography.titleSize)},
        bodySize: ${swiftPxLiteral(tokens.typography.bodySize)},
        captionSize: ${swiftPxLiteral(tokens.typography.captionSize)},
        promptInputSize: ${swiftPxLiteral(tokens.typography.promptInputSize)}
    )

    static let animation = Animation(
        springDuration: ${swiftSecondsLiteral(tokens.animation.springDuration)},
        springBounce: ${Number(tokens.animation.springBounce)},
        highlightDuration: ${swiftSecondsLiteral(tokens.animation.highlightDuration)}
    )
}
`;
}

function buildCss(tokens) {
  return `/* Generated by scripts/generate-theme-tokens.mjs. Do not edit by hand. */
@theme {
${cssThemeVariables(tokens)}
}

:root[data-theme="light"] {
${cssColorVariables(tokens.color.light)}
}

:root[data-theme="dark"] {
${cssColorVariables(tokens.color.dark)}
}
`;
}

function kebab(name) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function swiftStructFields(values, typeName) {
  return Object.keys(values).sort()
    .map((key) => `        let ${key}: ${typeName}`)
    .join("\\n");
}

function swiftInitializer(values, formatValue) {
  return Object.keys(values).sort()
    .map((key) => `        ${key}: ${formatValue(values[key])}`)
    .join(",\\n");
}

function swiftStringLiteral(value) {
  return JSON.stringify(String(value));
}

function swiftPxLiteral(value) {
  return Number(String(value).replace("px", ""));
}

function swiftSecondsLiteral(value) {
  return Number(String(value).replace("s", ""));
}

function cssThemeVariables(tokens) {
  const colorLines = Object.keys(tokens.color.light).sort()
    .map((key) => `  --color-app-${kebab(key)}: var(--ha-color-${kebab(key)});`);
  const spacingLines = Object.entries(tokens.spacing)
    .map(([key, value]) => `  --spacing-${kebab(key)}: ${value};`);
  const radiusLines = Object.entries(tokens.radius)
    .map(([key, value]) => `  --radius-${kebab(key)}: ${value};`);
  const fontLines = [
    `  --font-display: ${tokens.typography.displayFamily};`,
    `  --font-body: ${tokens.typography.bodyFamily};`,
    `  --font-code: ${tokens.typography.codeFamily};`,
  ];
  const shadowLines = Object.entries(tokens.shadow)
    .map(([key, value]) => `  --shadow-${kebab(key)}: ${value};`);
  return [...colorLines, ...spacingLines, ...radiusLines, ...fontLines, ...shadowLines].join("\\n");
}

function cssColorVariables(colors) {
  return Object.keys(colors).sort()
    .map((key) => `  --ha-color-${kebab(key)}: ${colors[key]};`)
    .join("\\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeGeneratedFiles();
}
```

- [ ] **Step 5: Generate outputs**

Run:

```bash
node scripts/generate-theme-tokens.mjs
```

Expected: `apps/desktop/Sources/Theme/GeneratedThemeTokens.swift` and `apps/thread-window-web/src/styles/generated-theme.css` are created or refreshed. Re-running the command without token changes produces no diff.

- [ ] **Step 6: Wire package scripts**

Modify root `package.json` scripts to include:

```json
{
  "scripts": {
    "build:electron-shell": "pnpm --filter handagent-electron-shell build",
    "build:thread-window-web": "pnpm --filter handagent-thread-window-web build",
    "generate:theme-tokens": "node scripts/generate-theme-tokens.mjs",
    "test:electron-shell": "pnpm --filter handagent-electron-shell test",
    "test:theme-tokens": "vitest run scripts/generate-theme-tokens.test.mjs",
    "test:thread-window-web": "pnpm --filter handagent-thread-window-web test",
    "test:llm:integration": "HANDAGENT_LLM_INTEGRATION=1 vitest run packages/core/tests/llm/vercel-client.integration.test.ts"
  }
}
```

- [ ] **Step 7: Add generator test to repository test script**

Modify `scripts/test.sh` so it runs root token tests before package tests:

```bash
pnpm test:theme-tokens
```

Expected location: after dependency setup and before package-specific Vitest runs.

- [ ] **Step 8: Verify green**

Run:

```bash
pnpm test:theme-tokens
bash ./scripts/test.sh
```

Expected: PASS. The generator test must fail if either generated output is edited by hand.

- [ ] **Step 9: Commit**

```bash
git add design/tokens.json scripts/generate-theme-tokens.mjs scripts/generate-theme-tokens.test.mjs apps/desktop/Sources/Theme/GeneratedThemeTokens.swift apps/thread-window-web/src/styles/generated-theme.css package.json scripts/test.sh pnpm-lock.yaml
git commit -m "feat: add generated cross-platform theme tokens"
```

---

### Task 2: Tailwind v4 And React Theme Runtime

**Files:**
- Modify: `apps/thread-window-web/package.json`
- Modify: `apps/thread-window-web/vite.config.ts`
- Modify: `apps/thread-window-web/src/styles/tailwind.css`
- Delete: `apps/thread-window-web/tailwind.config.js`
- Create: `apps/thread-window-web/src/native/themeConfig.ts`
- Create: `apps/thread-window-web/tests/themeConfig.test.ts`
- Modify: `apps/thread-window-web/tests/designTokens.test.ts`
- Modify: `apps/thread-window-web/src/App.tsx`
- Modify: `apps/thread-window-web/src/components/*.tsx`

- [ ] **Step 1: Write failing React theme config tests**

Create `apps/thread-window-web/tests/themeConfig.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyThemeToDocument, getInitialTheme, installThemeSubscription } from "../src/native/themeConfig.ts";

describe("themeConfig", () => {
  afterEach(() => {
    delete window.handAgentTheme;
    delete window.handAgentSubscribeThemeChange;
    document.documentElement.removeAttribute("data-theme");
  });

  it("falls back to system/light when preload did not provide a theme", () => {
    expect(getInitialTheme()).toEqual({ preference: "system", resolved: "light" });
  });

  it("applies the resolved theme to documentElement", () => {
    applyThemeToDocument({ preference: "dark", resolved: "dark" });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("subscribes to host theme changes and returns the host unsubscribe", () => {
    const unsubscribe = vi.fn();
    window.handAgentSubscribeThemeChange = vi.fn(() => unsubscribe);
    const handler = vi.fn();

    const dispose = installThemeSubscription(handler);

    expect(window.handAgentSubscribeThemeChange).toHaveBeenCalledOnce();
    dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter handagent-thread-window-web test -- tests/themeConfig.test.ts
```

Expected: FAIL because `src/native/themeConfig.ts` does not exist.

- [ ] **Step 3: Implement React theme config**

Create `apps/thread-window-web/src/native/themeConfig.ts`:

```ts
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export type HostTheme = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
};

declare global {
  interface Window {
    handAgentTheme?: HostTheme;
    handAgentSubscribeThemeChange?: (handler: (theme: HostTheme) => void) => () => void;
  }
}

const fallbackTheme: HostTheme = { preference: "system", resolved: "light" };

export function getInitialTheme(): HostTheme {
  return isHostTheme(window.handAgentTheme) ? window.handAgentTheme : fallbackTheme;
}

export function applyThemeToDocument(theme: HostTheme): void {
  document.documentElement.dataset.theme = theme.resolved;
}

export function installThemeSubscription(handler: (theme: HostTheme) => void): () => void {
  if (typeof window.handAgentSubscribeThemeChange !== "function") {
    return () => {};
  }
  return window.handAgentSubscribeThemeChange(handler);
}

function isHostTheme(value: unknown): value is HostTheme {
  return typeof value === "object"
    && value !== null
    && (value as HostTheme).preference !== undefined
    && (value as HostTheme).resolved !== undefined
    && ["light", "dark", "system"].includes((value as HostTheme).preference)
    && ["light", "dark"].includes((value as HostTheme).resolved);
}
```

- [ ] **Step 4: Wire theme application in App**

Modify `apps/thread-window-web/src/App.tsx` to import:

```ts
import { applyThemeToDocument, getInitialTheme, installThemeSubscription } from "./native/themeConfig.ts";
```

Add this effect near the existing native receiver effect:

```tsx
useEffect(() => {
  applyThemeToDocument(getInitialTheme());
  return installThemeSubscription((theme) => {
    applyThemeToDocument(theme);
  });
}, []);
```

- [ ] **Step 5: Upgrade Tailwind package and Vite plugin**

Modify `apps/thread-window-web/package.json`:

```json
{
  "scripts": {
    "dev": "pnpm --dir ../.. generate:theme-tokens && vite --host 127.0.0.1",
    "build": "pnpm --dir ../.. generate:theme-tokens && tsc -p tsconfig.json && vite build",
    "test": "vitest run"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@vitejs/plugin-react": "^5.1.1",
    "tailwindcss": "^4.0.0"
  }
}
```

Keep existing unrelated dependencies. Remove `autoprefixer` and `postcss` only if no other package references them.

- [ ] **Step 6: Add Tailwind v4 Vite plugin**

Modify `apps/thread-window-web/vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 7: Replace Tailwind entry CSS**

Replace `apps/thread-window-web/src/styles/tailwind.css` with:

```css
@import "tailwindcss";
@import "./generated-theme.css";

@layer base {
  :root {
    font-family: var(--font-body);
  }

  html,
  body,
  #root {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  body {
    margin: 0;
    min-width: 0;
    min-height: 0;
    background: var(--ha-color-canvas);
    color: var(--ha-color-text-primary);
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
  }

  * {
    box-sizing: border-box;
  }

  button {
    cursor: default;
  }

  textarea,
  input,
  button {
    font: inherit;
  }
}
```

- [ ] **Step 8: Delete Tailwind v3 config**

Delete:

```bash
rm apps/thread-window-web/tailwind.config.js
```

This is allowed because the user explicitly requested a destructive migration.

- [ ] **Step 9: Replace design token test**

Modify `apps/thread-window-web/tests/designTokens.test.ts` to read generated CSS:

```ts
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
```

- [ ] **Step 10: Replace old classes in React components**

Run:

```bash
rg -n "surface-dark|on-dark|surface-card|surface-soft|surface-cream|text-primary|text-secondary|primary|accent-ring|tool-bubble|user-bubble" apps/thread-window-web/src
```

Replace old Tailwind v3 token classes with generated v4 semantic classes:

```text
bg-surface-dark -> bg-app-canvas
bg-surface-dark-soft -> bg-app-surface
bg-surface-dark-elevated -> bg-app-surface-elevated
text-on-dark -> text-app-text-primary
text-on-dark-soft -> text-app-text-muted
border-white/10 -> border-app-hairline
bg-primary -> bg-app-accent
hover:bg-primary-active -> hover:bg-app-accent-hover
text-on-primary -> text-app-on-accent
bg-tool-bubble -> bg-app-tool-bubble
bg-user-bubble -> bg-app-user-bubble
focus:ring-accent-ring -> focus:ring-app-accent-ring
```

After replacement, run the same `rg` command again. Expected: no matches for old v3 token class names in `src`.

- [ ] **Step 11: Verify green**

Run:

```bash
pnpm install
pnpm --filter handagent-thread-window-web test
pnpm --filter handagent-thread-window-web build
```

Expected: tests and build pass under Tailwind v4.

- [ ] **Step 12: Commit**

```bash
git add apps/thread-window-web package.json pnpm-lock.yaml
git add -u apps/thread-window-web/tailwind.config.js
git commit -m "feat: migrate thread window to tailwind v4 theme tokens"
```

---

### Task 3: Swift Settings Persistence And Theme Model

**Files:**
- Create: `apps/desktop/Sources/AppServices/Appearance/AppearanceTheme.swift`
- Create: `apps/desktop/Sources/AppServices/Appearance/appearance.md`
- Create: `apps/desktop/Sources/Settings/AppearanceSettingsViewModel.swift`
- Create: `apps/desktop/Sources/Settings/AppearanceSettingsView.swift`
- Modify: `apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsStore.swift`
- Modify: `apps/desktop/Sources/Settings/SettingsStyles.swift`
- Modify: `apps/desktop/Sources/Settings/SettingsView.swift`
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/AgentSettings/AgentSettingsStoreTests.swift`
- Create: `apps/desktop/TestsSwift/Settings/AppearanceSettingsViewModelTests.swift`

- [ ] **Step 1: Write failing settings store tests**

Append to `apps/desktop/TestsSwift/AppServices/AgentSettings/AgentSettingsStoreTests.swift`:

```swift
@MainActor
func testLoadsDefaultAppearanceWhenSettingsFileDoesNotExist() {
    let homeURL = TestFiles.makeTemporaryHomeDirectory()
    defer { try? FileManager.default.removeItem(at: homeURL) }

    let store = AgentSettingsStore(homeDirectoryURL: homeURL)

    XCTAssertEqual(store.appearance.themePreference, .system)
}

@MainActor
func testUpdatingAppearancePreservesModelAndTools() throws {
    let homeURL = TestFiles.makeTemporaryHomeDirectory()
    defer { try? FileManager.default.removeItem(at: homeURL) }

    let fileURL = TestFiles.settingsFileURL(homeURL)
    try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try Data(
        """
        {
          "llm": {
            "provider": "anthropic",
            "model": "claude-sonnet",
            "apiKey": "key",
            "baseUrl": "https://example.com",
            "api": "chat"
          },
          "tools": {
            "denylist": ["screen.capture"]
          }
        }
        """.utf8
    ).write(to: fileURL)

    let store = AgentSettingsStore(homeDirectoryURL: homeURL)
    store.updateAppearance { appearance in
        appearance.themePreference = .dark
    }

    let json = try TestFiles.readJSON(fileURL)
    XCTAssertEqual((json["appearance"] as? [String: Any])?["themePreference"] as? String, "dark")
    XCTAssertEqual((json["llm"] as? [String: Any])?["model"] as? String, "claude-sonnet")
    XCTAssertEqual((json["tools"] as? [String: Any])?["denylist"] as? [String], ["screen.capture"])
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
bash ./scripts/swiftw test --filter AgentSettingsStoreTests
```

Expected: FAIL because `appearance`, `AppearanceThemePreference`, and `updateAppearance` do not exist.

- [ ] **Step 3: Add appearance model**

Create `apps/desktop/Sources/AppServices/Appearance/AppearanceTheme.swift`:

```swift
import AppKit

enum AppearanceThemePreference: String, CaseIterable, Codable, Equatable, Identifiable, Sendable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: return "跟随系统"
        case .light: return "浅色"
        case .dark: return "深色"
        }
    }
}

enum ResolvedAppearanceTheme: String, Codable, Equatable, Sendable {
    case light
    case dark
}

struct AppearanceSettings: Codable, Equatable, Sendable {
    var themePreference: AppearanceThemePreference

    static let defaultValue = AppearanceSettings(themePreference: .system)
}

struct HostThemePayload: Codable, Equatable, Sendable {
    let preference: AppearanceThemePreference
    let resolved: ResolvedAppearanceTheme
}
```

- [ ] **Step 4: Extend AgentSettingsStore**

Modify `AgentSettingsStore.swift`:

```swift
private struct AgentSettingsFile: Codable {
    var appearance: AppearanceSettings?
    var llm: AgentSettings?
    var tools: AgentToolSettings?
}
```

Add state and update method:

```swift
private(set) var appearance: AppearanceSettings

func updateAppearance(_ mutate: (inout AppearanceSettings) -> Void) {
    var nextAppearance = appearance
    mutate(&nextAppearance)
    appearance = nextAppearance
    persist()
}
```

Update load/persist tuples so `appearance` defaults to `.defaultValue` and is encoded with `llm` and `tools`.

- [ ] **Step 5: Write failing ViewModel test**

Create `apps/desktop/TestsSwift/Settings/AppearanceSettingsViewModelTests.swift`:

```swift
import XCTest
@testable import HandAgentDesktop

final class AppearanceSettingsViewModelTests: XCTestCase {
    @MainActor
    func testThemePreferenceWritesThroughStore() {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let viewModel = AppearanceSettingsViewModel(store: store)

        viewModel.themePreference = .dark

        XCTAssertEqual(store.appearance.themePreference, .dark)
    }
}
```

- [ ] **Step 6: Implement ViewModel and View**

Create `apps/desktop/Sources/Settings/AppearanceSettingsViewModel.swift`:

```swift
import Foundation

@Observable
@MainActor
final class AppearanceSettingsViewModel {
    @ObservationIgnored private let store: AgentSettingsStore

    init(store: AgentSettingsStore) {
        self.store = store
    }

    var themePreference: AppearanceThemePreference {
        get { store.appearance.themePreference }
        set {
            store.updateAppearance { appearance in
                appearance.themePreference = newValue
            }
        }
    }

    var saveErrorMessage: String? { store.saveErrorMessage }
}
```

Create `apps/desktop/Sources/Settings/AppearanceSettingsView.swift`:

```swift
import SwiftUI

struct AppearanceSettingsView: View {
    @Bindable var viewModel: AppearanceSettingsViewModel
    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(spacing: 0) {
            SettingsSectionHeader("外观")
            SettingsSection {
                SettingsRow("主题") {
                    Picker("主题", selection: $viewModel.themePreference) {
                        ForEach(AppearanceThemePreference.allCases) { preference in
                            Text(preference.title).tag(preference)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 260)
                }
            }
            if let saveErrorMessage = viewModel.saveErrorMessage {
                Text(saveErrorMessage)
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.error)
                    .padding(.horizontal, theme.spacing.xxl)
            }
            Spacer(minLength: 0)
        }
    }
}
```

- [ ] **Step 7: Add Settings tab**

Modify `SettingsTab` in `SettingsStyles.swift`:

```swift
case appearance
```

Place it after `.model`. Add title/icon cases:

```swift
case .appearance: return "外观"
case .appearance: return "circle.lefthalf.filled"
```

Modify `SettingsView` to accept:

```swift
@Bindable var appearanceViewModel: AppearanceSettingsViewModel
```

Add switch case:

```swift
case .appearance:
    AppearanceSettingsView(viewModel: appearanceViewModel)
```

Update `SettingsWindowPresenting` and all test presenters to pass the new ViewModel.

- [ ] **Step 8: Verify Swift tests**

Run:

```bash
bash ./scripts/swiftw test --filter AgentSettingsStoreTests
bash ./scripts/swiftw test --filter AppearanceSettingsViewModelTests
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/Sources/AppServices/Appearance apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsStore.swift apps/desktop/Sources/Settings apps/desktop/TestsSwift
git commit -m "feat: persist appearance theme settings"
```

---

### Task 4: Swift Generated Theme Consumption And Theme Service

**Files:**
- Modify: `apps/desktop/Sources/Theme/AppTheme.swift`
- Modify: `apps/desktop/Sources/Theme/ThemeEnvironment.swift`
- Create: `apps/desktop/Sources/AppServices/Appearance/AppearanceThemeService.swift`
- Create: `apps/desktop/TestsSwift/Theme/AppThemeGeneratedTokensTests.swift`
- Create: `apps/desktop/TestsSwift/AppServices/Appearance/AppearanceThemeServiceTests.swift`

- [ ] **Step 1: Write failing generated token theme tests**

Create `apps/desktop/TestsSwift/Theme/AppThemeGeneratedTokensTests.swift`:

```swift
import XCTest
@testable import HandAgentDesktop

final class AppThemeGeneratedTokensTests: XCTestCase {
    func testLightAndDarkThemesExposeGeneratedColors() {
        _ = AppTheme.light.colors.canvas
        _ = AppTheme.dark.colors.canvas
        _ = AppTheme.light.colors.accent
        _ = AppTheme.dark.colors.accent
    }

    func testResolvedThemeMapsToConcreteTheme() {
        XCTAssertEqual(AppTheme.resolved(.light).spacing.sm, AppTheme.light.spacing.sm)
        XCTAssertEqual(AppTheme.resolved(.dark).spacing.sm, AppTheme.dark.spacing.sm)
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
bash ./scripts/swiftw test --filter AppThemeGeneratedTokensTests
```

Expected: FAIL because `AppTheme.light`, `AppTheme.dark`, and `resolved(_:)` do not exist.

- [ ] **Step 3: Replace hand-written token source in AppTheme**

Modify `AppTheme.swift` so `AppTheme.default` aliases `.light`, and add:

```swift
static let light = AppTheme(
    colors: ThemeColors(generated: GeneratedThemeTokens.light),
    typography: .default,
    spacing: .generated,
    radius: .generated,
    animation: .generated
)

static let dark = AppTheme(
    colors: ThemeColors(generated: GeneratedThemeTokens.dark),
    typography: .default,
    spacing: .generated,
    radius: .generated,
    animation: .generated
)

static func resolved(_ resolved: ResolvedAppearanceTheme) -> AppTheme {
    switch resolved {
    case .light: return .light
    case .dark: return .dark
    }
}
```

Add `ThemeColors.init(generated:)` that maps generated semantic fields to existing API names, without preserving old color literals.

- [ ] **Step 4: Write failing theme service tests**

Create `apps/desktop/TestsSwift/AppServices/Appearance/AppearanceThemeServiceTests.swift`:

```swift
import XCTest
@testable import HandAgentDesktop

final class AppearanceThemeServiceTests: XCTestCase {
    @MainActor
    func testResolvesExplicitPreferenceWithoutSystemResolver() {
        let store = AgentSettingsStore(homeDirectoryURL: TestFiles.makeTemporaryHomeDirectory())
        let service = AppearanceThemeService(store: store, systemResolver: { .dark })

        store.updateAppearance { $0.themePreference = .light }

        XCTAssertEqual(service.currentTheme.resolved, .light)
    }

    @MainActor
    func testResolvesSystemPreferenceFromResolver() {
        let store = AgentSettingsStore(homeDirectoryURL: TestFiles.makeTemporaryHomeDirectory())
        let service = AppearanceThemeService(store: store, systemResolver: { .dark })

        store.updateAppearance { $0.themePreference = .system }

        XCTAssertEqual(service.currentTheme, HostThemePayload(preference: .system, resolved: .dark))
    }
}
```

- [ ] **Step 5: Implement theme service**

Create `AppearanceThemeService.swift`:

```swift
import AppKit
import Observation

@Observable
@MainActor
final class AppearanceThemeService {
    @ObservationIgnored private let store: AgentSettingsStore
    @ObservationIgnored private let systemResolver: () -> ResolvedAppearanceTheme
    var onThemeChange: ((HostThemePayload) -> Void)?

    init(
        store: AgentSettingsStore,
        systemResolver: @escaping () -> ResolvedAppearanceTheme = AppearanceThemeService.resolveSystemTheme
    ) {
        self.store = store
        self.systemResolver = systemResolver
    }

    var currentTheme: HostThemePayload {
        HostThemePayload(
            preference: store.appearance.themePreference,
            resolved: resolve(store.appearance.themePreference)
        )
    }

    var appTheme: AppTheme {
        AppTheme.resolved(currentTheme.resolved)
    }

    func updatePreference(_ preference: AppearanceThemePreference) {
        store.updateAppearance { appearance in
            appearance.themePreference = preference
        }
        onThemeChange?(currentTheme)
    }

    func systemAppearanceDidChange() {
        guard store.appearance.themePreference == .system else { return }
        onThemeChange?(currentTheme)
    }

    private func resolve(_ preference: AppearanceThemePreference) -> ResolvedAppearanceTheme {
        switch preference {
        case .light: return .light
        case .dark: return .dark
        case .system: return systemResolver()
        }
    }

    static func resolveSystemTheme() -> ResolvedAppearanceTheme {
        let bestMatch = NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua])
        return bestMatch == .darkAqua ? .dark : .light
    }
}
```

- [ ] **Step 6: Verify Swift tests**

Run:

```bash
bash ./scripts/swiftw test --filter AppThemeGeneratedTokensTests
bash ./scripts/swiftw test --filter AppearanceThemeServiceTests
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/Sources/Theme apps/desktop/Sources/AppServices/Appearance apps/desktop/TestsSwift/Theme apps/desktop/TestsSwift/AppServices/Appearance
git commit -m "feat: resolve swift themes from generated tokens"
```

---

### Task 5: Electron Theme Command And Preload Subscription

**Files:**
- Modify: `apps/electron-shell/src/main/protocol/electronShellProtocol.ts`
- Modify: `apps/electron-shell/src/main/electronShellRuntime.ts`
- Modify: `apps/electron-shell/src/main/windows/threadWindowPrewarmer.ts`
- Modify: `apps/electron-shell/src/preload/threadWindowPreload.ts`
- Modify: `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts`
- Modify: `apps/electron-shell/tests/main/electronShellRuntime.test.ts`
- Modify: `apps/electron-shell/tests/windows/threadWindowPrewarmer.test.ts`
- Modify: `apps/electron-shell/tests/preload/threadWindowPreload.test.ts`

- [ ] **Step 1: Write failing protocol tests**

Add to `electronShellProtocol.test.ts`:

```ts
it("accepts theme.changed commands with preference and resolved theme", () => {
  expect(isSwiftToElectronCommand({
    channel: "electron_shell",
    type: "theme.changed",
    commandId: "theme-1",
    theme: { preference: "system", resolved: "dark" },
  })).toBe(true);
});

it("rejects theme.changed commands with invalid resolved theme", () => {
  expect(isSwiftToElectronCommand({
    channel: "electron_shell",
    type: "theme.changed",
    commandId: "theme-1",
    theme: { preference: "system", resolved: "system" },
  })).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run:

```bash
pnpm --filter handagent-electron-shell test -- tests/protocol/electronShellProtocol.test.ts
```

Expected: FAIL because protocol does not accept `theme.changed`.

- [ ] **Step 3: Extend TS protocol**

Add types:

```ts
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type HostTheme = { preference: ThemePreference; resolved: ResolvedTheme };
```

Add command union member:

```ts
| {
    channel: "electron_shell";
    type: "theme.changed";
    commandId: string;
    theme: HostTheme;
  }
```

Add guard:

```ts
case "theme.changed":
  return isHostTheme(value.theme);
```

With helper:

```ts
function isHostTheme(value: unknown): value is HostTheme {
  return isRecord(value)
    && (value.preference === "light" || value.preference === "dark" || value.preference === "system")
    && (value.resolved === "light" || value.resolved === "dark");
}
```

- [ ] **Step 4: Write failing runtime and window tests**

Add runtime test that sends `theme.changed` and expects `prewarmer.updateTheme` and command ack:

```ts
await harness.runtime.handleCommand({
  channel: "electron_shell",
  type: "theme.changed",
  commandId: "theme-1",
  theme: { preference: "system", resolved: "dark" },
});
expect(harness.prewarmer.updateTheme).toHaveBeenCalledWith({ preference: "system", resolved: "dark" });
```

Add `updateTheme: vi.fn()` to runtime harness prewarmer.

- [ ] **Step 5: Implement runtime routing**

Extend `ThreadWindowHost`:

```ts
updateTheme(theme: HostTheme): Promise<void>;
```

Handle command:

```ts
case "theme.changed":
  await this.runCommand(command, () => this.options.prewarmer.updateTheme(command.theme));
  return;
```

- [ ] **Step 6: Implement ThreadWindowPrewarmer theme broadcast**

Extend `BrowserWindowLike.webContents`:

```ts
send(channel: "handagent:theme-changed", theme: HostTheme): void;
```

Add state:

```ts
private theme: HostTheme = { preference: "system", resolved: "light" };
```

Add method:

```ts
async updateTheme(theme: HostTheme): Promise<void> {
  this.theme = theme;
  if (this.window && this.prepared) {
    this.window.webContents.send("handagent:theme-changed", theme);
  }
}
```

When creating the BrowserWindow, pass theme to preload through `additionalArguments`:

```ts
additionalArguments: [`--handagent-theme=${encodeURIComponent(JSON.stringify(this.theme))}`],
```

- [ ] **Step 7: Implement preload subscription**

Modify `threadWindowPreload.ts`:

```ts
import { contextBridge, ipcRenderer } from "electron";

type HostTheme = {
  preference: "light" | "dark" | "system";
  resolved: "light" | "dark";
};

const fallbackTheme: HostTheme = { preference: "system", resolved: "light" };
const initialTheme = readInitialTheme();
```

Expose in main world:

```ts
window.handAgentTheme = theme;
```

Expose subscription:

```ts
contextBridge.exposeInMainWorld("handAgentSubscribeThemeChange", (handler: (theme: HostTheme) => void) => {
  const listener = (_event: unknown, theme: HostTheme) => {
    if (isHostTheme(theme)) {
      handler(theme);
    }
  };
  ipcRenderer.on("handagent:theme-changed", listener);
  return () => ipcRenderer.off("handagent:theme-changed", listener);
});
```

Do not expose raw `ipcRenderer`.

- [ ] **Step 8: Verify Electron tests**

Run:

```bash
pnpm --filter handagent-electron-shell test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/electron-shell/src apps/electron-shell/tests
git commit -m "feat: sync theme through electron shell"
```

---

### Task 6: Swift Electron Theme Command Integration

**Files:**
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/ThreadWindowCommanding.swift`
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`
- Modify: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`
- Modify: `apps/desktop/Sources/Coordinator/SettingsLifecycle.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/ElectronShellProtocolTests.swift`
- Modify: `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift`

- [ ] **Step 1: Write failing Swift protocol encoding test**

Add a test:

```swift
func testEncodesThemeChangedCommand() throws {
    let command = ElectronShellCommand.themeChanged(
        commandId: "theme-1",
        theme: HostThemePayload(preference: .system, resolved: .dark)
    )
    let data = try JSONEncoder().encode(command)
    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    let theme = json?["theme"] as? [String: Any]

    XCTAssertEqual(json?["channel"] as? String, "electron_shell")
    XCTAssertEqual(json?["type"] as? String, "theme.changed")
    XCTAssertEqual(json?["commandId"] as? String, "theme-1")
    XCTAssertEqual(theme?["preference"] as? String, "system")
    XCTAssertEqual(theme?["resolved"] as? String, "dark")
}
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bash ./scripts/swiftw test --filter ElectronShellProtocolTests
```

Expected: FAIL because `themeChanged` does not exist.

- [ ] **Step 3: Add Swift command**

Modify `ElectronShellCommand`:

```swift
case themeChanged(commandId: String, theme: HostThemePayload)
```

Encode:

```swift
case .themeChanged(let commandId, let theme):
    try container.encode("theme.changed", forKey: .type)
    try container.encode(commandId, forKey: .commandId)
    try container.encode(theme, forKey: .theme)
```

Add `theme` to coding keys.

- [ ] **Step 4: Add command method to app server**

Add protocol method:

```swift
@discardableResult
func sendThemeChanged(_ theme: HostThemePayload) throws -> String
```

Implement in `ElectronBackedAppServer`:

```swift
@discardableResult
func sendThemeChanged(_ theme: HostThemePayload) throws -> String {
    let commandId = UUID().uuidString
    try shell.send(.themeChanged(commandId: commandId, theme: theme))
    return commandId
}
```

Theme command does not need to enter thread-window pending command kind because failed ack is not part of availability gating.

- [ ] **Step 5: Wire AppearanceThemeService to Electron command**

In `AppCoordinator` bootstrap or service wiring, set:

```swift
services.appearanceThemeService.onThemeChange = { [weak self] theme in
    try? self?.services.threadWindowCommandClient.sendThemeChanged(theme)
}
```

When Electron becomes available, send current theme once:

```swift
try? services.threadWindowCommandClient.sendThemeChanged(services.appearanceThemeService.currentTheme)
```

Inject:

```swift
.environment(\.appTheme, services.appearanceThemeService.appTheme)
```

into PromptPanel and Settings hosting roots where `appTheme` is currently defaulted.

- [ ] **Step 6: Verify Swift integration tests**

Run:

```bash
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/Sources/AppServices apps/desktop/Sources/Coordinator apps/desktop/TestsSwift
git commit -m "feat: send host theme from swift to electron"
```

---

### Task 7: Startup Script Integration, Docs, And Final Cleanup

**Files:**
- Modify: `scripts/swiftw`
- Modify: `apps/thread-window-web/package.json`
- Modify: `handAgent.md`
- Modify: `apps/apps.md`
- Modify: `apps/desktop/desktop.md`
- Modify: `apps/desktop/Sources/Theme/theme.md`
- Modify: `apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md`
- Modify: `apps/desktop/Sources/Settings/settings.md`
- Modify: `apps/electron-shell/electron-shell.md`
- Modify: `apps/electron-shell/src/preload/preload.md`
- Modify: `apps/thread-window-web/thread-window-web.md`
- Modify: `docs/manual-qa.md`

- [ ] **Step 1: Write failing startup script expectation**

Run:

```bash
rg -n "generate:theme-tokens|generate-theme-tokens" scripts/swiftw apps/thread-window-web/package.json
```

Expected before implementation: missing from `scripts/swiftw`, or missing from one of ThreadWindow dev/build scripts.

- [ ] **Step 2: Wire `swiftw run` to generator**

Add to `scripts/swiftw`:

```bash
ensure_theme_tokens() {
  ensure_workspace_dependencies
  (
    cd "$ROOT_DIR"
    pnpm generate:theme-tokens
  )
}
```

Call it before `ensure_thread_window_web_build`:

```bash
if [[ "${1:-}" == "run" && "${2:-}" == "HandAgentDesktop" ]]; then
  ensure_theme_tokens
  ensure_thread_window_web_build
  ensure_electron_shell_build
fi
```

- [ ] **Step 3: Ensure ThreadWindow dev/build runs generator**

Confirm `apps/thread-window-web/package.json` scripts are:

```json
{
  "dev": "pnpm --dir ../.. generate:theme-tokens && vite --host 127.0.0.1",
  "build": "pnpm --dir ../.. generate:theme-tokens && tsc -p tsconfig.json && vite build",
  "test": "vitest run"
}
```

- [ ] **Step 4: Verify no old implementation remains**

Run:

```bash
test ! -f apps/thread-window-web/tailwind.config.js
rg -n "surface-dark|on-dark|surface-card|surface-soft|tailwind.config|Color\\(red:" apps/thread-window-web apps/desktop/Sources/Theme
```

Expected: first command exits 0. Second command has no matches for old Tailwind token classes or old Swift hand-written theme color literals. If the second command reports valid generated CSS values, narrow the search to exclude `generated-theme.css`.

- [ ] **Step 5: Update docs**

Apply these doc facts:

```text
handAgent.md: Swift host owns appearance preference and sends resolved theme to Electron through the command bridge.
apps/apps.md: apps layer includes theme.changed Swift-to-Electron command for UI theme state.
apps/desktop/desktop.md: Settings includes Appearance; Theme module consumes generated tokens.
apps/desktop/Sources/Theme/theme.md: tokens are generated from design/tokens.json.
apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md: settings.json includes top-level appearance.themePreference.
apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md: theme.changed is a Swift-to-Electron command.
apps/desktop/Sources/Settings/settings.md: Settings has Appearance tab.
apps/electron-shell/electron-shell.md: Electron stores current host theme and provides it to ThreadWindow.
apps/electron-shell/src/preload/preload.md: ThreadWindow preload exposes handAgentTheme and handAgentSubscribeThemeChange.
apps/thread-window-web/thread-window-web.md: Tailwind v4 CSS-first generated-theme.css is the style token source.
docs/manual-qa.md: add manual QA for light, dark, system, live ThreadWindow update, and restart persistence.
```

- [ ] **Step 6: Run full verification**

Run:

```bash
pnpm install
bash ./scripts/test.sh
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```

Expected: all pass.

- [ ] **Step 7: Commit final docs and startup cleanup**

```bash
git add scripts/swiftw apps/thread-window-web/package.json handAgent.md apps/apps.md apps/desktop/desktop.md apps/desktop/Sources/Theme/theme.md apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md apps/desktop/Sources/Settings/settings.md apps/electron-shell/electron-shell.md apps/electron-shell/src/preload/preload.md apps/thread-window-web/thread-window-web.md docs/manual-qa.md
git commit -m "docs: document generated theme token architecture"
```

---

## Self-Review

Spec coverage:

- Single token source is covered by Task 1.
- Tailwind v4 CSS-first migration is covered by Task 2.
- Swift settings persistence is covered by Task 3.
- Swift generated token consumption and system resolution are covered by Task 4.
- Electron command and preload subscription are covered by Task 5.
- Swift-to-Electron wiring is covered by Task 6.
- Startup generation, docs, manual QA, and old implementation deletion are covered by Task 7.

Placeholder scan:

- This plan contains concrete file paths, commands, names, and values.
- Examples use concrete names and values.

Type consistency:

- Theme preference names are `AppearanceThemePreference` in Swift and `ThemePreference` in TypeScript.
- Resolved theme names are `ResolvedAppearanceTheme` in Swift and `ResolvedTheme` in TypeScript.
- Cross-process payload shape is `HostThemePayload` in Swift and `HostTheme` in TypeScript, both with `preference` and `resolved`.

---

Plan complete and saved to `docs/superpowers/plans/2026-06-09-cross-platform-theme-tokens.md`. Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.
