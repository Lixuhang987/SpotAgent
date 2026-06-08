import { describe, expect, it, vi } from "vitest";
import { ElectronShellRuntime } from "../../src/main/electronShellRuntime.js";
import type {
  ElectronToSwiftEvent,
  SwiftToElectronCommand,
} from "../../src/main/protocol/electronShellProtocol.js";

describe("ElectronShellRuntime", () => {
  it("acknowledges prepare commands after preparing the thread window", async () => {
    const harness = createHarness();

    await harness.runtime.handleCommand({
      channel: "electron_shell",
      type: "thread_window.prepare",
      commandId: "cmd-prepare",
    });

    expect(harness.prewarmer.prepare).toHaveBeenCalledTimes(1);
    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "command.ack",
      commandId: "cmd-prepare",
      ok: true,
    });
  });

  it("acks prepare false when preparation fails", async () => {
    const harness = createHarness({ prepareError: new Error("load failed") });

    await harness.runtime.handleCommand({
      channel: "electron_shell",
      type: "thread_window.prepare",
      commandId: "cmd-prepare",
    });

    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "command.ack",
      commandId: "cmd-prepare",
      ok: false,
      error: "load failed",
    });
  });

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

  it("forwards healthy agent server events and prepares the thread window", () => {
    const harness = createHarness();

    harness.runtime.handleAgentServerHealth({ available: true });

    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "agent_server.health",
      available: true,
    });
    expect(harness.prewarmer.prepare).toHaveBeenCalledTimes(1);
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
  const stopSupervisor = vi.fn();
  const quit = vi.fn();
  const runtime = new ElectronShellRuntime({
    prewarmer,
    send: (event) => events.push(event),
    now: () => "2026-06-08T00:00:00.000Z",
    stopSupervisor,
    quit,
  });

  return { runtime, prewarmer, events, stopSupervisor, quit };
}
