import { describe, expect, it } from "vitest";
import type { ClientResponse } from "../../src/protocol/ClientResponse.ts";
import type { PlatformBridgeMessage } from "../../src/protocol/PlatformBridgeMessage.ts";
import type { ServerRequest } from "../../src/protocol/ServerRequest.ts";
import type { SessionCommand } from "../../src/protocol/SessionCommand.ts";
import type { SessionEvent } from "../../src/protocol/SessionEvent.ts";

describe("session command/event protocol", () => {
  it("keeps UI commands separate from server events", () => {
    const command: SessionCommand = {
      type: "turn_start",
      sessionId: "s1",
      commandId: "c1",
      timestamp: "2026-06-03T00:00:00.000Z",
      payload: { text: "hello" },
    };
    const event: SessionEvent = {
      type: "assistant_delta",
      sessionId: "s1",
      eventId: "e1",
      turnId: "t1",
      itemId: "i1",
      timestamp: "2026-06-03T00:00:01.000Z",
      payload: { text: "world" },
    };

    expect(command.type).toBe("turn_start");
    expect(event.type).toBe("assistant_delta");
  });

  it("models server requests separately from client responses", () => {
    const request: ServerRequest = {
      type: "permission_ask",
      requestId: "s1:tc1",
      sessionId: "s1",
      timestamp: "2026-06-03T00:00:00.000Z",
      payload: {
        toolName: "file.write",
        toolCallId: "tc1",
        arguments: { path: "/tmp/a.txt" },
      },
    };
    const response: ClientResponse = {
      type: "permission_answer",
      requestId: "s1:tc1",
      timestamp: "2026-06-03T00:00:01.000Z",
      payload: { decision: "allow", scope: "once" },
    };

    expect(request.type).toBe("permission_ask");
    expect(response.type).toBe("permission_answer");
  });

  it("models single-connection session routing explicitly", () => {
    const subscribe: SessionCommand = {
      type: "session_subscribe",
      sessionId: "s1",
      commandId: "c2",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: {},
    };
    const unsubscribe: SessionCommand = {
      type: "session_unsubscribe",
      sessionId: "s1",
      commandId: "c3",
      timestamp: "2026-06-04T00:00:01.000Z",
      payload: {},
    };
    const snapshot: SessionEvent = {
      type: "session_snapshot",
      sessionId: "s1",
      eventId: "e2",
      commandId: "c2",
      timestamp: "2026-06-04T00:00:00.100Z",
      payload: { messages: [], status: "idle" },
    };

    expect(subscribe.type).toBe("session_subscribe");
    expect(unsubscribe.type).toBe("session_unsubscribe");
    expect(snapshot.sessionId).toBe(subscribe.sessionId);
    expect(snapshot.commandId).toBe(subscribe.commandId);
  });

  it("keeps platform bridge messages on an independent channel", () => {
    const platformMessage: PlatformBridgeMessage = {
      channel: "platform",
      type: "platform_request",
      messageId: "p1",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: {
        requestId: "r1",
        method: "screen.capture",
        args: { target: "frontmost" },
      },
    };

    expect(platformMessage.channel).toBe("platform");
    expect(platformMessage.type).toBe("platform_request");
  });
});
