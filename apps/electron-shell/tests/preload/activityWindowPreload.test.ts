import { beforeEach, describe, expect, it, vi } from "vitest";

type MainWorldScript = {
  func: (url: string, theme: HostTheme) => void;
  args: [string, HostTheme];
};

type ActivityWindowGlobals = {
  handAgentActivityWindowConfig?: { activityWebSocketURL?: string };
  handAgentTheme?: HostTheme;
  handAgentSubscribeThemeChange?: (handler: (theme: HostTheme) => void) => () => void;
};

type HostTheme = {
  preference: "light" | "dark" | "system";
  resolved: "light" | "dark";
};

describe("activityWindowPreload", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as { window?: ActivityWindowGlobals }).window;
    process.argv = process.argv.filter((arg) => !arg.startsWith("--handagent-theme="));
  });

  it("installs activity window config in the renderer main world", async () => {
    const contextBridge = {
      executeInMainWorld: vi.fn(),
      exposeInMainWorld: vi.fn(),
    };
    const ipcRenderer = { send: vi.fn() };
    vi.doMock("electron", () => ({ contextBridge, ipcRenderer }));

    await import("../../src/preload/activityWindowPreload.js");

    expect(contextBridge.executeInMainWorld).toHaveBeenCalledTimes(1);
    const script = contextBridge.executeInMainWorld.mock.calls[0]?.[0] as MainWorldScript;
    const mainWorld: ActivityWindowGlobals = {};
    (globalThis as { window?: ActivityWindowGlobals }).window = mainWorld;

    script.func(...script.args);

    expect(mainWorld.handAgentActivityWindowConfig?.activityWebSocketURL).toBe(
      "ws://127.0.0.1:4317/api/activity",
    );
    expect(mainWorld.handAgentTheme).toEqual({ preference: "system", resolved: "light" });
  });

  it("reads the initial host theme from additional arguments", async () => {
    const theme: HostTheme = { preference: "dark", resolved: "dark" };
    process.argv.push(`--handagent-theme=${encodeURIComponent(JSON.stringify(theme))}`);
    const contextBridge = {
      executeInMainWorld: vi.fn(),
      exposeInMainWorld: vi.fn(),
    };
    const ipcRenderer = { on: vi.fn(), off: vi.fn(), send: vi.fn() };
    vi.doMock("electron", () => ({ contextBridge, ipcRenderer }));

    await import("../../src/preload/activityWindowPreload.js");

    const script = contextBridge.executeInMainWorld.mock.calls[0]?.[0] as MainWorldScript;
    const mainWorld: ActivityWindowGlobals = {};
    (globalThis as { window?: ActivityWindowGlobals }).window = mainWorld;

    script.func(...script.args);

    expect(mainWorld.handAgentTheme).toEqual(theme);
  });

  it("exposes a filtered host theme subscription", async () => {
    const contextBridge = {
      executeInMainWorld: vi.fn(),
      exposeInMainWorld: vi.fn(),
    };
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const ipcRenderer = {
      on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
        listeners.set(channel, listener);
      }),
      off: vi.fn(),
      send: vi.fn(),
    };
    vi.doMock("electron", () => ({ contextBridge, ipcRenderer }));

    await import("../../src/preload/activityWindowPreload.js");

    const exposed = contextBridge.exposeInMainWorld.mock.calls.find(([name]) => name === "handAgentSubscribeThemeChange")?.[1] as
      | ((handler: (theme: HostTheme) => void) => () => void)
      | undefined;
    expect(exposed).toBeTypeOf("function");
    const handler = vi.fn();
    const dispose = exposed?.(handler);

    listeners.get("handagent:theme-changed")?.({}, { preference: "light", resolved: "light" });
    listeners.get("handagent:theme-changed")?.({}, { preference: "system", resolved: "system" });
    listeners.get("handagent:theme-changed")?.({}, { preference: "dark", resolved: "dark" });
    dispose?.();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, { preference: "light", resolved: "light" });
    expect(handler).toHaveBeenNthCalledWith(2, { preference: "dark", resolved: "dark" });
    expect(ipcRenderer.off).toHaveBeenCalledWith(
      "handagent:theme-changed",
      expect.any(Function),
    );
  });

  it("exposes a focusThread bridge that sends focus requests to main", async () => {
    const contextBridge = {
      executeInMainWorld: vi.fn(),
      exposeInMainWorld: vi.fn(),
    };
    const ipcRenderer = { on: vi.fn(), off: vi.fn(), send: vi.fn() };
    vi.doMock("electron", () => ({ contextBridge, ipcRenderer }));

    await import("../../src/preload/activityWindowPreload.js");

    const [name, api] = contextBridge.exposeInMainWorld.mock.calls.find(([exposedName]) => exposedName === "handAgentActivityWindow") ?? [];
    expect(name).toBe("handAgentActivityWindow");

    (api as { focusThread(threadId: string | null): void }).focusThread("thread-1");
    (api as { focusThread(threadId: string | null): void }).focusThread(null);

    expect(ipcRenderer.send).toHaveBeenCalledWith("activity-window:focus-thread", "thread-1");
    expect(ipcRenderer.send).toHaveBeenCalledWith("activity-window:focus-thread", null);
  });
});
