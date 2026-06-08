import { describe, expect, it } from "vitest";

import { ActivitySocketClient } from "../../src/activity-window/activitySocketClient.ts";

class FakeWebSocket {
  public onmessage: ((event: { data: string }) => void) | null = null;
  public closed = false;

  constructor(public readonly url: string) {}

  close(): void {
    this.closed = true;
  }

  emitMessage(data: string): void {
    this.onmessage?.({ data });
  }
}

describe("ActivitySocketClient", () => {
  it("parses valid activity snapshot messages and ignores malformed JSON and wrong channels", () => {
    const events: unknown[] = [];
    const client = new ActivitySocketClient({
      url: "ws://127.0.0.1:4317/api/activity",
      onEvent: (event) => events.push(event),
      WebSocketCtor: FakeWebSocket,
    });

    const socket = client.connect() as FakeWebSocket;
    socket.emitMessage("{");
    socket.emitMessage(
      JSON.stringify({
        channel: "thread",
        type: "activity.snapshot",
        activeThreadId: "thread-1",
        status: "idle",
        latestSummary: null,
        waitingRequest: null,
        error: null,
        updatedAt: "2026-06-08T00:00:00.000Z",
      }),
    );
    socket.emitMessage(
      JSON.stringify({
        channel: "activity",
        type: "activity.snapshot",
        activeThreadId: "thread-1",
        status: "idle",
        latestSummary: null,
        waitingRequest: null,
        error: null,
        updatedAt: "2026-06-08T00:00:00.000Z",
      }),
    );

    expect(events).toEqual([
      {
        channel: "activity",
        type: "activity.snapshot",
        activeThreadId: "thread-1",
        status: "idle",
        latestSummary: null,
        waitingRequest: null,
        error: null,
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
    ]);
  });

  it("closes the active socket", () => {
    const client = new ActivitySocketClient({
      url: "ws://127.0.0.1:4317/api/activity",
      onEvent: () => {},
      WebSocketCtor: FakeWebSocket,
    });

    const socket = client.connect() as FakeWebSocket;
    client.close();

    expect(socket.closed).toBe(true);
  });
});
