import { describe, expect, it } from "vitest";
import type { Op } from "../../src/protocol/Op.ts";
import type { ThreadCommand } from "../../src/protocol/ThreadCommand.ts";

describe("Op protocol", () => {
  it("supports user_input with text, image, skill, and text_selection items", () => {
    const op: Op = {
      type: "user_input",
      opId: "op-1",
      timestamp: "2026-06-10T00:00:00.000Z",
      payload: {
        items: [
          { type: "text", id: "item-1", text: "hello" },
          { type: "image", id: "item-2", mimeType: "image/png", base64: "abc" },
          { type: "skill", id: "item-3", actionId: "skill/weather", title: "天气", prompt: "查询天气" },
          { type: "text_selection", id: "item-4", text: "selected" },
        ],
      },
    };

    expect(op.type).toBe("user_input");
    expect(op.payload.items.map((item) => item.type)).toEqual([
      "text",
      "image",
      "skill",
      "text_selection",
    ]);
  });

  it("supports interrupt ops", () => {
    const op: Op = {
      type: "interrupt",
      opId: "op-2",
      timestamp: "2026-06-10T00:00:01.000Z",
      payload: { reason: "user" },
    };

    expect(op.type).toBe("interrupt");
    expect(op.payload.reason).toBe("user");
  });

  it("keeps thread lifecycle commands separate from runtime ops", () => {
    const command: ThreadCommand = {
      type: "thread.start",
      commandId: "cmd-1",
      timestamp: "2026-06-10T00:00:00.000Z",
      payload: { workspaceId: null, actionBinding: null },
    };

    expect(command.type).toBe("thread.start");
  });
});
