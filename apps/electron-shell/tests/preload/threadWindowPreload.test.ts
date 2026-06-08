import { beforeEach, describe, expect, it, vi } from "vitest";

type MainWorldScript = {
  func: (url: string) => void;
  args: [string];
};

type ThreadWindowGlobals = {
  handAgentThreadWindowConfig?: { threadWebSocketURL?: string };
  handAgentPendingInitialPrompts?: unknown[];
  handAgentReceiveInitialPrompt?: (payload: unknown) => void;
};

describe("threadWindowPreload", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as { window?: ThreadWindowGlobals }).window;
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
});
