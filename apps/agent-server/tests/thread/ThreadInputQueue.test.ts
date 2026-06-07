import { describe, expect, it } from "vitest";
import type { ThreadAttachment } from "@handagent/core/protocol/ThreadProtocolShared.ts";
import { ThreadInputQueue, type ThreadInputItem } from "../../src/thread/ThreadInputQueue.ts";

function userItem(messageId: string, text: string): ThreadInputItem {
  return {
    kind: "user",
    threadId: "thread-queue",
    messageId,
    timestamp: "2026-06-07T00:00:00.000Z",
    payload: { text },
  };
}

describe("ThreadInputQueue", () => {
  it("drains queued input in FIFO order", () => {
    const queue = new ThreadInputQueue();

    queue.enqueue(userItem("u1", "first"));
    queue.enqueue(userItem("u2", "second"));

    expect(queue.hasPending()).toBe(true);
    expect(queue.takeAll()).toEqual([
      userItem("u1", "first"),
      userItem("u2", "second"),
    ]);
    expect(queue.hasPending()).toBe(false);
  });

  it("resolves waiters when input arrives", async () => {
    const queue = new ThreadInputQueue();
    const waiter = queue.waitForItems();

    queue.enqueue(userItem("u1", "wake"));

    await expect(waiter).resolves.toEqual([userItem("u1", "wake")]);
    expect(queue.hasPending()).toBe(false);
  });

  it("keeps attachment payloads on user input items", () => {
    const attachments: ThreadAttachment[] = [
      { kind: "text_selection", id: "selection-1", text: "selected text" },
    ];
    const queue = new ThreadInputQueue();

    queue.enqueue({
      kind: "user",
      threadId: "thread-queue",
      messageId: "u1",
      timestamp: "2026-06-07T00:00:00.000Z",
      payload: { text: "with attachment", attachments },
    });

    expect(queue.takeAll()[0]).toMatchObject({
      kind: "user",
      payload: { attachments },
    });
  });

  it("clears pending input without resolving future waits", async () => {
    const queue = new ThreadInputQueue();

    queue.enqueue(userItem("u1", "discard"));
    queue.clear();

    expect(queue.takeAll()).toEqual([]);
    expect(queue.hasPending()).toBe(false);

    const waiter = queue.waitForItems();
    const timeout = Symbol("timeout");

    await expect(
      Promise.race([
        waiter.then(() => "resolved"),
        new Promise((resolve) => {
          setTimeout(() => resolve(timeout), 10);
        }),
      ]),
    ).resolves.toBe(timeout);

    const nextItem = userItem("u2", "after-clear");
    queue.enqueue(nextItem);

    await expect(waiter).resolves.toEqual([nextItem]);
    expect(queue.hasPending()).toBe(false);
  });
});
