import { beforeEach, describe, expect, it, vi } from "vitest";

type MainWorldScript = {
  func: (url: string) => void;
  args: [string];
};

type ActivityWindowGlobals = {
  handAgentActivityWindowConfig?: { activityWebSocketURL?: string };
};

describe("activityWindowPreload", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as { window?: ActivityWindowGlobals }).window;
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
  });

  it("exposes a focusThread bridge that sends focus requests to main", async () => {
    const contextBridge = {
      executeInMainWorld: vi.fn(),
      exposeInMainWorld: vi.fn(),
    };
    const ipcRenderer = { send: vi.fn() };
    vi.doMock("electron", () => ({ contextBridge, ipcRenderer }));

    await import("../../src/preload/activityWindowPreload.js");

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1);
    const [name, api] = contextBridge.exposeInMainWorld.mock.calls[0] ?? [];
    expect(name).toBe("handAgentActivityWindow");

    (api as { focusThread(threadId: string | null): void }).focusThread("thread-1");
    (api as { focusThread(threadId: string | null): void }).focusThread(null);

    expect(ipcRenderer.send).toHaveBeenCalledWith("activity-window:focus-thread", "thread-1");
    expect(ipcRenderer.send).toHaveBeenCalledWith("activity-window:focus-thread", null);
  });
});
