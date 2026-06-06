import { describe, expect, it } from "vitest";
import {
  encodePermissionAnswer,
  encodeThreadList,
  encodeThreadStart,
  encodeTurnStart,
  isServerRequest,
  isThreadNotification,
} from "../src/protocol/threadProtocol.ts";

describe("thread protocol helpers", () => {
  it("encodes thread.start with nullable payload fields", () => {
    expect(JSON.parse(encodeThreadStart({
      commandId: "cmd-1",
      timestamp: "2026-06-06T00:00:00.000Z",
      workspaceId: null,
      actionBinding: null,
    }))).toEqual({
      type: "thread.start",
      commandId: "cmd-1",
      timestamp: "2026-06-06T00:00:00.000Z",
      payload: { workspaceId: null, actionBinding: null },
    });
  });

  it("encodes turn.start with attachments", () => {
    expect(JSON.parse(encodeTurnStart({
      threadId: "thread-1",
      commandId: "cmd-2",
      timestamp: "2026-06-06T00:00:01.000Z",
      text: "hello",
      attachments: [{ kind: "text_selection", id: "sel-1", text: "selected" }],
    }))).toMatchObject({
      type: "turn.start",
      threadId: "thread-1",
      payload: {
        text: "hello",
        attachments: [{ kind: "text_selection", id: "sel-1", text: "selected" }],
      },
    });
  });

  it("encodes thread.list and permission answer", () => {
    expect(JSON.parse(encodeThreadList({
      commandId: "cmd-list",
      timestamp: "2026-06-06T00:00:02.000Z",
    })).type).toBe("thread.list");
    expect(JSON.parse(encodePermissionAnswer({
      requestId: "thread-1:req-1",
      timestamp: "2026-06-06T00:00:03.000Z",
      decision: "allow",
      scope: "thread",
    }))).toMatchObject({
      type: "permission.answered",
      requestId: "thread-1:req-1",
      payload: { decision: "allow", scope: "thread" },
    });
  });

  it("guards inbound notifications and requests", () => {
    expect(isThreadNotification({
      type: "assistant.delta",
      threadId: "thread-1",
      notificationId: "n1",
      turnId: "turn-1",
      itemId: "assistant-1",
      timestamp: "2026-06-06T00:00:04.000Z",
      payload: { text: "hi" },
    })).toBe(true);

    expect(isServerRequest({
      type: "workspace.requested",
      requestId: "thread-1:req-2",
      threadId: "thread-1",
      timestamp: "2026-06-06T00:00:05.000Z",
      payload: { prompt: "Pick", candidates: [] },
    })).toBe(true);
  });
});
