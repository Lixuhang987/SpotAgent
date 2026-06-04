import { describe, expect, it } from "vitest";
import { SessionEventPublisher } from "../../src/session/SessionEventPublisher.ts";
import type { SessionEvent } from "@handagent/core/protocol/SessionEvent.ts";

describe("SessionEventPublisher", () => {
  it("fans out session-scoped events only to subscribed connections", () => {
    const publisher = new SessionEventPublisher();
    const first: Array<SessionEvent["type"]> = [];
    const second: Array<SessionEvent["type"]> = [];

    publisher.attachConnection("c1", (event) => {
      if ("type" in event) first.push(event.type as SessionEvent["type"]);
    });
    publisher.attachConnection("c2", (event) => {
      if ("type" in event) second.push(event.type as SessionEvent["type"]);
    });

    publisher.subscribe("c1", "s1");
    publisher.publish({
      type: "assistant_delta",
      sessionId: "s1",
      eventId: "e1",
      turnId: "t1",
      itemId: "i1",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { text: "hi" },
    });

    expect(first).toEqual(["assistant_delta"]);
    expect(second).toEqual([]);
  });

  it("supports one connection subscribing to multiple sessions and unsubscribing independently", () => {
    const publisher = new SessionEventPublisher();
    const seen: string[] = [];

    publisher.attachConnection("c1", (event) => {
      if ("sessionId" in event) {
        seen.push(`${event.sessionId}:${event.type}`);
      }
    });

    publisher.subscribe("c1", "s1");
    publisher.subscribe("c1", "s2");
    publisher.publish({
      type: "session_snapshot",
      sessionId: "s1",
      eventId: "e1",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { messages: [], status: "idle" },
    });
    publisher.publish({
      type: "session_snapshot",
      sessionId: "s2",
      eventId: "e2",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { messages: [], status: "idle" },
    });
    publisher.unsubscribe("c1", "s1");
    publisher.publish({
      type: "assistant_delta",
      sessionId: "s1",
      eventId: "e3",
      turnId: "t1",
      itemId: "i1",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { text: "ignored" },
    });
    publisher.publish({
      type: "assistant_delta",
      sessionId: "s2",
      eventId: "e4",
      turnId: "t1",
      itemId: "i1",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { text: "kept" },
    });

    expect(seen).toEqual([
      "s1:session_snapshot",
      "s2:session_snapshot",
      "s2:assistant_delta",
    ]);
  });

  it("broadcasts global events to every attached connection and detaches cleanly", () => {
    const publisher = new SessionEventPublisher();
    const first: string[] = [];
    const second: string[] = [];

    publisher.attachConnection("c1", (event) => first.push(event.type));
    publisher.attachConnection("c2", (event) => second.push(event.type));
    publisher.publish({
      type: "sessions_listed",
      eventId: "e1",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { sessions: [] },
    });

    publisher.detachConnection("c2");
    publisher.publish({
      type: "sessions_listed",
      eventId: "e2",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { sessions: [] },
    });

    expect(first).toEqual(["sessions_listed", "sessions_listed"]);
    expect(second).toEqual(["sessions_listed"]);
  });
});
