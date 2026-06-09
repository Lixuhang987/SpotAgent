import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyThemeToDocument, getInitialTheme, installThemeSubscription } from "../src/native/themeConfig.ts";

const globalScope = globalThis as Record<string, unknown>;

describe("themeConfig", () => {
  beforeEach(() => {
    const documentElement = {
      dataset: {} as DOMStringMap,
      removeAttribute: vi.fn((name: string) => {
        if (name === "data-theme") {
          delete documentElement.dataset.theme;
        }
      }),
    };
    globalScope.document = { documentElement } as unknown as Document;
    globalScope.window = {} as Window;
  });

  afterEach(() => {
    delete window.handAgentTheme;
    delete window.handAgentSubscribeThemeChange;
    document.documentElement.removeAttribute("data-theme");
    Reflect.deleteProperty(globalScope, "document");
    Reflect.deleteProperty(globalScope, "window");
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
