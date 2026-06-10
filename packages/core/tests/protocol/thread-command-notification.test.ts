import { describe, expect, it } from "vitest";
import type { AgentActivityEvent } from "../../src/protocol/AgentActivity.ts";
import type { ClientResponse } from "../../src/protocol/ClientResponse.ts";
import type { PlatformBridgeMessage } from "../../src/protocol/PlatformBridgeMessage.ts";
import type { ServerRequest } from "../../src/protocol/ServerRequest.ts";
import type { ThreadCommand } from "../../src/protocol/ThreadCommand.ts";
import type { ThreadNotification } from "../../src/protocol/ThreadNotification.ts";

describe("thread command/notification protocol", () => {
  it("keeps UI commands separate from server notifications", () => {
    const command: ThreadCommand = {
      type: "op.submit",
      threadId: "thread-1",
      commandId: "command-op",
      timestamp: "2026-06-05T00:00:00.000Z",
      payload: {
        op: {
          type: "user_input",
          opId: "input-1",
          timestamp: "2026-06-05T00:00:00.000Z",
          payload: { items: [{ type: "text", id: "item-1", text: "hello" }] },
        },
      },
    };
    const notification: ThreadNotification = {
      type: "assistant.delta",
      threadId: "thread-1",
      notificationId: "notification-1",
      turnId: "turn-1",
      itemId: "item-1",
      timestamp: "2026-06-05T00:00:01.000Z",
      payload: { text: "world" },
    };

    expect(command.type).toBe("op.submit");
    expect(notification.type).toBe("assistant.delta");
  });

  it("exposes lifecycle commands separately from runtime op submission", () => {
    const start: ThreadCommand = {
      type: "thread.start",
      commandId: "command-start",
      timestamp: "2026-06-05T00:00:00.000Z",
      payload: {
        workspaceId: null,
        actionBinding: null,
      },
    };
    const resume: ThreadCommand = {
      type: "thread.resume",
      threadId: "thread-1",
      commandId: "command-resume",
      timestamp: "2026-06-05T00:00:01.000Z",
    };
    const list: ThreadCommand = {
      type: "thread.list",
      commandId: "command-list",
      timestamp: "2026-06-05T00:00:02.000Z",
    };
    const deleteCommand: ThreadCommand = {
      type: "thread.delete",
      commandId: "command-delete",
      timestamp: "2026-06-05T00:00:03.000Z",
      payload: { targetThreadId: "thread-1" },
    };
    const submitOp: ThreadCommand = {
      type: "op.submit",
      threadId: "thread-1",
      commandId: "command-op",
      timestamp: "2026-06-05T00:00:03.500Z",
      payload: {
        op: {
          type: "interrupt",
          opId: "op-interrupt",
          timestamp: "2026-06-05T00:00:03.500Z",
          payload: { reason: "user" },
        },
      },
    };

    expect([
      start.type,
      resume.type,
      list.type,
      deleteCommand.type,
      submitOp.type,
    ]).toEqual([
      "thread.start",
      "thread.resume",
      "thread.list",
      "thread.delete",
      "op.submit",
    ]);
  });

  it("models server requests separately from client responses", () => {
    const request: ServerRequest = {
      type: "permission.requested",
      requestId: "thread-1:tool-1",
      threadId: "thread-1",
      timestamp: "2026-06-05T00:00:00.000Z",
      payload: {
        toolName: "file.write",
        toolCallId: "tool-1",
        arguments: { path: "/tmp/a.txt" },
      },
    };
    const response: ClientResponse = {
      type: "permission.answered",
      requestId: "thread-1:tool-1",
      timestamp: "2026-06-05T00:00:01.000Z",
      payload: { decision: "allow", scope: "once" },
    };

    expect(request.type).toBe("permission.requested");
    expect(request.threadId).toBe("thread-1");
    expect(response.type).toBe("permission.answered");
  });

  it("models thread resume as snapshot notification", () => {
    const resume: ThreadCommand = {
      type: "thread.resume",
      threadId: "thread-1",
      commandId: "command-resume",
      timestamp: "2026-06-05T00:00:00.000Z",
    };
    const snapshot: ThreadNotification = {
      type: "thread.snapshot",
      threadId: "thread-1",
      notificationId: "notification-2",
      commandId: "command-resume",
      timestamp: "2026-06-05T00:00:00.100Z",
      payload: { messages: [], status: "idle" },
    };

    expect(snapshot.threadId).toBe(resume.threadId);
    expect(snapshot.commandId).toBe(resume.commandId);
  });

  it("keeps platform bridge messages on an independent channel", () => {
    const platformMessage: PlatformBridgeMessage = {
      channel: "platform",
      type: "platform_request",
      messageId: "p1",
      timestamp: "2026-06-05T00:00:00.000Z",
      payload: {
        requestId: "r1",
        method: "screen.capture",
        args: { target: "frontmost" },
      },
    };

    expect(platformMessage.channel).toBe("platform");
    expect(platformMessage.type).toBe("platform_request");
  });

  it("models activity stream separately from thread notifications", () => {
    const snapshot: AgentActivityEvent = {
      channel: "activity",
      type: "activity.snapshot",
      activeThreadId: "thread-1",
      status: "running",
      latestSummary: "正在回复",
      waitingRequest: null,
      error: null,
      updatedAt: "2026-06-08T00:00:00.000Z",
    };
    const changed: AgentActivityEvent = {
      channel: "activity",
      type: "activity.changed",
      activeThreadId: "thread-1",
      status: "tool_running",
      latestSummary: "正在使用 file.read",
      waitingRequest: null,
      error: null,
      updatedAt: "2026-06-08T00:00:01.000Z",
    };

    expect(snapshot.channel).toBe("activity");
    expect(snapshot.type).toBe("activity.snapshot");
    expect(changed.status).toBe("tool_running");
  });
});
