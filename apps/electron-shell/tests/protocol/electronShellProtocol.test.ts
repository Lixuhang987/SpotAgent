import { describe, expect, it } from "vitest";
import {
  encodeEvent,
  isSwiftToElectronCommand,
  parseCommand,
} from "../../src/main/protocol/electronShellProtocol.js";

describe("electronShellProtocol", () => {
  it("parses open initial prompt commands", () => {
    const command = parseCommand(JSON.stringify({
      channel: "electron_shell",
      type: "thread_window.open_initial_prompt",
      commandId: "cmd-1",
      payload: {
        clientRequestId: "prompt-1",
        userInput: {
          items: [
            { type: "text", id: "text-1", text: "hello" },
            { type: "text_selection", id: "selection-1", text: "selected text" },
            { type: "image", id: "image-1", mimeType: "image/png", base64: "abc123" },
          ],
        },
        actionBinding: { pluginId: "plugin-a", promptName: "prompt-a" },
      },
    }));

    expect(isSwiftToElectronCommand(command)).toBe(true);
    expect(command.type).toBe("thread_window.open_initial_prompt");
    expect(command.payload.userInput.items).toHaveLength(3);
    expect(command.payload.actionBinding?.pluginId).toBe("plugin-a");
  });

  it("rejects commands without the electron shell channel", () => {
    expect(() => parseCommand(JSON.stringify({
      channel: "platform",
      type: "thread_window.focus",
      commandId: "cmd-2",
    }))).toThrow("unsupported electron shell command");
  });

  it("rejects prepare commands because prewarming is startup-owned", () => {
    expect(() => parseCommand(JSON.stringify({
      channel: "electron_shell",
      type: "thread_window.prepare",
      commandId: "cmd-prepare",
    }))).toThrow("unsupported electron shell command");
  });

  it("parses activity window show commands", () => {
    const command = parseCommand(JSON.stringify({
      channel: "electron_shell",
      type: "activity_window.show",
      commandId: "cmd-activity",
    }));

    expect(command.type).toBe("activity_window.show");
  });

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

  it("encodes command acknowledgements", () => {
    expect(encodeEvent({
      channel: "electron_shell",
      type: "command.ack",
      commandId: "cmd-3",
      ok: false,
      error: "renderer unavailable",
    })).toBe("{\"channel\":\"electron_shell\",\"type\":\"command.ack\",\"commandId\":\"cmd-3\",\"ok\":false,\"error\":\"renderer unavailable\"}");
  });

  it("encodes visible thread window close events", () => {
    expect(encodeEvent({
      channel: "electron_shell",
      type: "thread_window.closed",
      timestamp: "2026-06-08T00:00:00.000Z",
      wasVisible: true,
    })).toBe("{\"channel\":\"electron_shell\",\"type\":\"thread_window.closed\",\"timestamp\":\"2026-06-08T00:00:00.000Z\",\"wasVisible\":true}");
  });

  it("rejects legacy initial prompt text and attachment payloads", () => {
    expect(() => parseCommand(JSON.stringify({
      channel: "electron_shell",
      type: "thread_window.open_initial_prompt",
      commandId: "cmd-4",
      payload: {
        clientRequestId: "prompt-4",
        text: "hello",
        attachments: [],
        actionBinding: null,
      },
    }))).toThrow("unsupported electron shell command");
  });

  it("rejects malformed initial prompt user input items", () => {
    expect(() => parseCommand(JSON.stringify({
      channel: "electron_shell",
      type: "thread_window.open_initial_prompt",
      commandId: "cmd-5",
      payload: {
        clientRequestId: "prompt-5",
        userInput: {
          items: [{ type: "image", id: "image-1", mimeType: "image/gif", base64: "abc123" }],
        },
        actionBinding: null,
      },
    }))).toThrow("unsupported electron shell command");
  });
});
