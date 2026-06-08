import { describe, expect, it, vi } from "vitest";
import { ElectronShellRuntime } from "../../src/main/electronShellRuntime.js";
import type {
  ElectronToSwiftEvent,
  SwiftToElectronCommand,
} from "../../src/main/protocol/electronShellProtocol.js";

describe("ElectronShellRuntime", () => {
  it("acknowledges initial prompt commands", async () => {
    const harness = createHarness();
    const payload: InitialPromptPayload = {
      clientRequestId: "request-1",
      text: "hello",
      attachments: [],
      actionBinding: null,
    };

    await harness.runtime.handleCommand({
      channel: "electron_shell",
      type: "thread_window.open_initial_prompt",
      commandId: "cmd-prompt",
      payload,
    });

    expect(harness.prewarmer.openInitialPrompt).toHaveBeenCalledWith(payload);
    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "command.ack",
      commandId: "cmd-prompt",
      ok: true,
    });
  });

  it("acknowledges open history commands", async () => {
    const harness = createHarness();

    await harness.runtime.handleCommand({
      channel: "electron_shell",
      type: "thread_window.open_history",
      commandId: "cmd-history",
    });

    expect(harness.prewarmer.openHistory).toHaveBeenCalledTimes(1);
    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "command.ack",
      commandId: "cmd-history",
      ok: true,
    });
  });

  it("acknowledges activity window show commands", async () => {
    const harness = createHarness();

    await harness.runtime.handleCommand({
      channel: "electron_shell",
      type: "activity_window.show",
      commandId: "cmd-activity",
    });

    expect(harness.activityWindow.show).toHaveBeenCalledTimes(1);
    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "command.ack",
      commandId: "cmd-activity",
      ok: true,
    });
  });

  it("requests the Swift prompt panel when activity click cannot focus a thread window", () => {
    const harness = createHarness({ focusResult: false });

    harness.runtime.handleActivityWindowFocusRequest(null);

    expect(harness.prewarmer.focus).not.toHaveBeenCalled();
    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "prompt_panel.show_requested",
      reason: "activity_window.clicked_without_thread",
    });
  });

  it("focuses the thread window when an activity click has a visible thread", () => {
    const harness = createHarness();

    harness.runtime.handleActivityWindowFocusRequest("thread-1");

    expect(harness.prewarmer.focus).toHaveBeenCalledTimes(1);
    expect(harness.events).not.toContainEqual({
      channel: "electron_shell",
      type: "prompt_panel.show_requested",
      reason: "activity_window.clicked_without_thread",
    });
  });

  it("acks focus false when no visible thread window exists", async () => {
    const harness = createHarness({ focusResult: false });

    await harness.runtime.handleCommand({
      channel: "electron_shell",
      type: "thread_window.focus",
      commandId: "cmd-focus",
      threadId: null,
    });

    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "command.ack",
      commandId: "cmd-focus",
      ok: false,
      error: "thread window is not visible",
    });
  });

  it("acks shutdown commands after stopping the supervisor and quitting", async () => {
    const harness = createHarness();

    await harness.runtime.handleCommand({
      channel: "electron_shell",
      type: "shutdown",
      commandId: "cmd-shutdown",
    });

    expect(harness.stopSupervisor).toHaveBeenCalledTimes(1);
    expect(harness.quit).toHaveBeenCalledTimes(1);
    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "command.ack",
      commandId: "cmd-shutdown",
      ok: true,
    });
  });

  it("prewarms the thread window only after agent server health is available", async () => {
    const harness = createHarness();

    harness.runtime.handleAgentServerHealth({ available: false, message: "starting" });
    expect(harness.prewarmer.prepare).not.toHaveBeenCalled();

    harness.runtime.handleAgentServerHealth({ available: true });
    await Promise.resolve();

    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "agent_server.health",
      available: true,
    });
    expect(harness.prewarmer.prepare).toHaveBeenCalledTimes(1);
    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "thread_window.prepared",
      timestamp: "2026-06-08T00:00:00.000Z",
    });
  });

  it("reports visible close events and prepares a replacement", async () => {
    const harness = createHarness();
    harness.runtime.handleAgentServerHealth({ available: true });

    harness.runtime.handleThreadWindowClosed({ wasPrepared: true, wasVisible: true });

    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "thread_window.closed",
      timestamp: "2026-06-08T00:00:00.000Z",
      wasVisible: true,
    });
    expect(harness.prewarmer.prepare).toHaveBeenCalledTimes(1);
  });

  it("does not stop the supervisor when the visible thread window closes", () => {
    const harness = createHarness();
    harness.runtime.handleAgentServerHealth({ available: true });

    harness.runtime.handleThreadWindowClosed({ wasPrepared: true, wasVisible: true });

    expect(harness.stopSupervisor).not.toHaveBeenCalled();
    expect(harness.quit).not.toHaveBeenCalled();
    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "thread_window.closed",
      timestamp: "2026-06-08T00:00:00.000Z",
      wasVisible: true,
    });
  });

  it("does not prepare a replacement for unprepared closed windows", () => {
    const harness = createHarness();
    harness.runtime.handleAgentServerHealth({ available: true });

    harness.runtime.handleThreadWindowClosed({ wasPrepared: false, wasVisible: false });

    expect(harness.prewarmer.prepare).toHaveBeenCalledTimes(1);
  });
});

type InitialPromptPayload = Extract<
  SwiftToElectronCommand,
  { type: "thread_window.open_initial_prompt" }
>["payload"];

function createHarness(options: { focusResult?: boolean; prepareError?: Error } = {}) {
  const events: ElectronToSwiftEvent[] = [];
  const prewarmer = {
    prepare: vi.fn(async () => {
      if (options.prepareError) {
        throw options.prepareError;
      }
    }),
    openInitialPrompt: vi.fn(async () => {}),
    openHistory: vi.fn(async () => {}),
    focus: vi.fn(() => options.focusResult ?? true),
  };
  const activityWindow = {
    show: vi.fn(async () => {}),
  };
  const stopSupervisor = vi.fn();
  const quit = vi.fn();
  const runtime = new ElectronShellRuntime({
    prewarmer,
    activityWindow,
    send: (event) => events.push(event),
    now: () => "2026-06-08T00:00:00.000Z",
    stopSupervisor,
    quit,
  });

  return { runtime, prewarmer, activityWindow, events, stopSupervisor, quit };
}
