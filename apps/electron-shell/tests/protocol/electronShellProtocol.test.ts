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
        attachments: [],
        actionBinding: null,
      },
    }));

    expect(isSwiftToElectronCommand(command)).toBe(true);
    expect(command.type).toBe("thread_window.open_initial_prompt");
    expect(command.payload.text).toBe("hello");
  });

  it("rejects commands without the electron shell channel", () => {
    expect(() => parseCommand(JSON.stringify({
      channel: "platform",
      type: "thread_window.focus",
      commandId: "cmd-2",
    }))).toThrow("unsupported electron shell command");
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
});
