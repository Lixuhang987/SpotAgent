import { beforeEach, describe, expect, it, vi } from "vitest";

type MainWorldScript = {
  func: (url: string, theme: HostTheme) => void;
  args: [string, HostTheme];
};

type HostTheme = {
  preference: "light" | "dark" | "system";
  resolved: "light" | "dark";
};

type ThreadWindowGlobals = {
  handAgentThreadWindowConfig?: { threadWebSocketURL?: string };
  handAgentTheme?: HostTheme;
  handAgentSubscribeThemeChange?: (handler: (theme: HostTheme) => void) => () => void;
  handAgentPendingInitialPrompts?: unknown[];
  handAgentReceiveInitialPrompt?: (payload: unknown) => void;
};

describe("threadWindowPreload", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as { window?: ThreadWindowGlobals }).window;
    process.argv = process.argv.filter((arg) => !arg.startsWith("--handagent-theme="));
  });

  it("installs thread window globals in the renderer main world", async () => {
    const contextBridge = {
      executeInMainWorld: vi.fn(),
      exposeInMainWorld: vi.fn(),
    };
    vi.doMock("electron", () => ({ contextBridge }));

    await import("../../src/preload/threadWindowPreload.js");

    expect(contextBridge.executeInMainWorld).toHaveBeenCalledTimes(1);
    const script = contextBridge.executeInMainWorld.mock.calls[0]?.[0] as MainWorldScript;
    const mainWorld: ThreadWindowGlobals = {};
    (globalThis as { window?: ThreadWindowGlobals }).window = mainWorld;

    script.func(...script.args);
    mainWorld.handAgentReceiveInitialPrompt?.({ clientRequestId: "prompt-1" });

    expect(mainWorld.handAgentThreadWindowConfig?.threadWebSocketURL).toBe(
      "ws://127.0.0.1:4317/api/thread",
    );
    expect(mainWorld.handAgentTheme).toEqual({ preference: "system", resolved: "light" });
    expect(mainWorld.handAgentPendingInitialPrompts).toEqual([{ clientRequestId: "prompt-1" }]);
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith("handAgentElectron", {
      phase: "phase-0",
    });
  });

  it("preserves an existing main-world initial prompt receiver", async () => {
    const contextBridge = {
      executeInMainWorld: vi.fn(),
      exposeInMainWorld: vi.fn(),
    };
    vi.doMock("electron", () => ({ contextBridge }));

    await import("../../src/preload/threadWindowPreload.js");

    const script = contextBridge.executeInMainWorld.mock.calls[0]?.[0] as MainWorldScript;
    const receiver = vi.fn();
    const pending = [{ clientRequestId: "early-prompt" }];
    const mainWorld: ThreadWindowGlobals = {
      handAgentPendingInitialPrompts: pending,
      handAgentReceiveInitialPrompt: receiver,
    };
    (globalThis as { window?: ThreadWindowGlobals }).window = mainWorld;

    script.func(...script.args);
    mainWorld.handAgentReceiveInitialPrompt?.({ clientRequestId: "prompt-2" });

    expect(mainWorld.handAgentPendingInitialPrompts).toBe(pending);
    expect(receiver).toHaveBeenCalledWith({ clientRequestId: "prompt-2" });
  });

  it("reads the initial theme from preload arguments", async () => {
    const contextBridge = {
      executeInMainWorld: vi.fn(),
      exposeInMainWorld: vi.fn(),
    };
    vi.doMock("electron", () => ({ contextBridge, ipcRenderer: createIpcRendererMock() }));
    process.argv.push(`--handagent-theme=${encodeURIComponent(JSON.stringify({ preference: "dark", resolved: "dark" }))}`);

    await import("../../src/preload/threadWindowPreload.js");

    const script = contextBridge.executeInMainWorld.mock.calls[0]?.[0] as MainWorldScript;
    const mainWorld: ThreadWindowGlobals = {};
    (globalThis as { window?: ThreadWindowGlobals }).window = mainWorld;

    script.func(...script.args);

    expect(mainWorld.handAgentTheme).toEqual({ preference: "dark", resolved: "dark" });
  });

  it("exposes a validated theme change subscription", async () => {
    const contextBridge = {
      executeInMainWorld: vi.fn(),
      exposeInMainWorld: vi.fn(),
    };
    const ipcRenderer = createIpcRendererMock();
    vi.doMock("electron", () => ({ contextBridge, ipcRenderer }));

    await import("../../src/preload/threadWindowPreload.js");

    const exposed = contextBridge.exposeInMainWorld.mock.calls.find(([name]) => name === "handAgentSubscribeThemeChange")?.[1] as
      | ((handler: (theme: HostTheme) => void) => () => void)
      | undefined;
    expect(exposed).toBeTypeOf("function");
    const handler = vi.fn();
    const unsubscribe = exposed?.(handler);

    ipcRenderer.emit("handagent:theme-changed", {}, { preference: "light", resolved: "light" });
    ipcRenderer.emit("handagent:theme-changed", {}, { preference: "system", resolved: "system" });
    unsubscribe?.();
    ipcRenderer.emit("handagent:theme-changed", {}, { preference: "dark", resolved: "dark" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ preference: "light", resolved: "light" });
  });
});

function createIpcRendererMock() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      listeners.set(channel, listeners.get(channel) ?? new Set());
      listeners.get(channel)?.add(listener);
    }),
    off: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      listeners.get(channel)?.delete(listener);
    }),
    emit: (channel: string, ...args: unknown[]) => {
      for (const listener of listeners.get(channel) ?? []) {
        listener(...args);
      }
    },
  };
}
