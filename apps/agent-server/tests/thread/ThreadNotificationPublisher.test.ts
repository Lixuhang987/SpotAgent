import { describe, expect, it } from "vitest";
import { ThreadNotificationPublisher } from "../../src/thread/ThreadNotificationPublisher.ts";
import type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";

describe("ThreadNotificationPublisher", () => {
  it("observes published messages without changing thread fanout", () => {
    const observed: string[] = [];
    const publisher = new ThreadNotificationPublisher((event) => observed.push(event.type));
    const sent: string[] = [];
    publisher.attachConnection("c1", (event) => sent.push(event.type));
    publisher.subscribe("c1", "thread-1");

    publisher.publish({
      type: "turn.started",
      threadId: "thread-1",
      notificationId: "n1",
      turnId: "turn-1",
      timestamp: "2026-06-08T00:00:00.000Z",
      payload: {},
    });
    publisher.publishToConnection("c1", {
      type: "permission.requested",
      requestId: "thread-1:tool-1",
      threadId: "thread-1",
      timestamp: "2026-06-08T00:00:00.000Z",
      payload: {
        toolName: "file.write",
        toolCallId: "tool-1",
        arguments: { path: "a.txt" },
      },
    });

    expect(sent).toEqual(["turn.started", "permission.requested"]);
    expect(observed).toEqual(["turn.started", "permission.requested"]);
  });

  it("fans out thread-scoped notifications only to subscribed connections", () => {
    const publisher = new ThreadNotificationPublisher();
    const first: Array<ThreadNotification["type"]> = [];
    const second: Array<ThreadNotification["type"]> = [];

    publisher.attachConnection("c1", (event) => {
      if ("type" in event) first.push(event.type as ThreadNotification["type"]);
    });
    publisher.attachConnection("c2", (event) => {
      if ("type" in event) second.push(event.type as ThreadNotification["type"]);
    });

    publisher.subscribe("c1", "s1");
    publisher.publish({
      type: "assistant.delta",
      threadId: "s1",
      notificationId: "e1",
      turnId: "t1",
      itemId: "i1",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { text: "hi" },
    });

    expect(first).toEqual(["assistant.delta"]);
    expect(second).toEqual([]);
  });

  it("supports one connection subscribing to multiple threads and dropping one subscription independently", () => {
    const publisher = new ThreadNotificationPublisher();
    const seen: string[] = [];

    publisher.attachConnection("c1", (event) => {
      if ("threadId" in event) {
        seen.push(`${event.threadId}:${event.type}`);
      }
    });

    publisher.subscribe("c1", "s1");
    publisher.subscribe("c1", "s2");
    publisher.publish({
      type: "thread.snapshot",
      threadId: "s1",
      notificationId: "e1",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { messages: [], status: "idle" },
    });
    publisher.publish({
      type: "thread.snapshot",
      threadId: "s2",
      notificationId: "e2",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { messages: [], status: "idle" },
    });
    publisher.unsubscribe("c1", "s1");
    publisher.publish({
      type: "assistant.delta",
      threadId: "s1",
      notificationId: "e3",
      turnId: "t1",
      itemId: "i1",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { text: "ignored" },
    });
    publisher.publish({
      type: "assistant.delta",
      threadId: "s2",
      notificationId: "e4",
      turnId: "t1",
      itemId: "i1",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { text: "kept" },
    });

    expect(seen).toEqual([
      "s1:thread.snapshot",
      "s2:thread.snapshot",
      "s2:assistant.delta",
    ]);
  });

  it("broadcasts global notifications to every attached connection and detaches cleanly", () => {
    const publisher = new ThreadNotificationPublisher();
    const first: string[] = [];
    const second: string[] = [];

    publisher.attachConnection("c1", (event) => first.push(event.type));
    publisher.attachConnection("c2", (event) => second.push(event.type));
    publisher.publish({
      type: "thread.listed",
      notificationId: "e1",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { threads: [] },
    });

    publisher.detachConnection("c2");
    publisher.publish({
      type: "thread.listed",
      notificationId: "e2",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: { threads: [] },
    });

    expect(first).toEqual(["thread.listed", "thread.listed"]);
    expect(second).toEqual(["thread.listed"]);
  });
});
