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
        text: "hello",
        attachments: [
          { kind: "text_selection", id: "selection-1", text: "selected text" },
          { kind: "image", id: "image-1", mimeType: "image/png", base64: "abc123" },
        ],
        actionBinding: { pluginId: "plugin-a", promptName: "prompt-a" },
      },
    }));

    expect(isSwiftToElectronCommand(command)).toBe(true);
    expect(command.type).toBe("thread_window.open_initial_prompt");
    expect(command.payload.text).toBe("hello");
    expect(command.payload.attachments).toHaveLength(2);
    expect(command.payload.actionBinding?.pluginId).toBe("plugin-a");
  });

  it("rejects commands without the electron shell channel", () => {
    expect(() => parseCommand(JSON.stringify({
      channel: "platform",
      type: "thread_window.focus",
      commandId: "cmd-2",
    }))).toThrow("unsupported electron shell command");
  });

  it("parses prepare commands", () => {
    const command = parseCommand(JSON.stringify({
      channel: "electron_shell",
      type: "thread_window.prepare",
      commandId: "cmd-prepare",
    }));

    expect(command.type).toBe("thread_window.prepare");
  });

  it("parses activity window show commands", () => {
    const command = parseCommand(JSON.stringify({
      channel: "electron_shell",
      type: "activity_window.show",
      commandId: "cmd-activity",
    }));

    expect(command.type).toBe("activity_window.show");
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

  it("encodes prompt panel request events", () => {
    expect(encodeEvent({
      channel: "electron_shell",
      type: "prompt_panel.show_requested",
      reason: "activity_window.clicked_without_thread",
    })).toBe("{\"channel\":\"electron_shell\",\"type\":\"prompt_panel.show_requested\",\"reason\":\"activity_window.clicked_without_thread\"}");
  });

  it("rejects malformed initial prompt attachments", () => {
    expect(() => parseCommand(JSON.stringify({
      channel: "electron_shell",
      type: "thread_window.open_initial_prompt",
      commandId: "cmd-4",
      payload: {
        clientRequestId: "prompt-4",
        text: "hello",
        attachments: [{ kind: "image", id: "image-1", mimeType: "image/gif", base64: "abc123" }],
        actionBinding: null,
      },
    }))).toThrow("unsupported electron shell command");
  });
});
