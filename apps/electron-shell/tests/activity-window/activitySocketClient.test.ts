import { beforeEach, describe, expect, it } from "vitest";

import { ActivitySocketClient } from "../../src/activity-window/activitySocketClient.ts";

class FakeWebSocket {
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public closed = false;
  public static instances: FakeWebSocket[] = [];

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  emitMessage(data: string): void {
    this.onmessage?.({ data });
  }

  emitClose(): void {
    this.onclose?.();
  }

  emitError(): void {
    this.onerror?.();
  }
}

class FakeTimers {
  public scheduled: Array<{
    callback: () => void;
    delayMs: number;
    active: boolean;
  }> = [];

  setTimeout(callback: () => void, delayMs: number): unknown {
    const task = { callback, delayMs, active: true };
    this.scheduled.push(task);
    return task;
  }

  clearTimeout(handle: unknown): void {
    const task = handle as { active?: boolean };
    task.active = false;
  }

  runNext(): void {
    const task = this.scheduled.find((candidate) => candidate.active);
    if (!task) return;
    task.active = false;
    task.callback();
  }
}

describe("ActivitySocketClient", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });

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

  it("reconnects after close and error using the injected timer scheduler", () => {
    const timers = new FakeTimers();
    const client = new ActivitySocketClient({
      url: "ws://127.0.0.1:4317/api/activity",
      onEvent: () => {},
      WebSocketCtor: FakeWebSocket,
      setTimeoutFn: timers.setTimeout.bind(timers),
      clearTimeoutFn: timers.clearTimeout.bind(timers),
    });

    const firstSocket = client.connect() as FakeWebSocket;
    firstSocket.emitClose();

    expect(timers.scheduled).toEqual([
      expect.objectContaining({ delayMs: 1000, active: true }),
    ]);

    timers.runNext();
    expect(FakeWebSocket.instances).toHaveLength(2);

    const secondSocket = FakeWebSocket.instances[1];
    secondSocket.emitError();
    timers.runNext();

    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it("stops reconnecting after close and ignores stale messages from the old socket", () => {
    const timers = new FakeTimers();
    const events: unknown[] = [];
    const client = new ActivitySocketClient({
      url: "ws://127.0.0.1:4317/api/activity",
      onEvent: (event) => events.push(event),
      WebSocketCtor: FakeWebSocket,
      setTimeoutFn: timers.setTimeout.bind(timers),
      clearTimeoutFn: timers.clearTimeout.bind(timers),
    });

    const socket = client.connect() as FakeWebSocket;
    socket.emitClose();
    client.close();
    timers.runNext();
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

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(events).toEqual([]);
  });

  it("ignores invalid status, invalid waitingRequest, and missing required fields", () => {
    const events: unknown[] = [];
    const client = new ActivitySocketClient({
      url: "ws://127.0.0.1:4317/api/activity",
      onEvent: (event) => events.push(event),
      WebSocketCtor: FakeWebSocket,
    });
    const socket = client.connect() as FakeWebSocket;

    socket.emitMessage(
      JSON.stringify({
        channel: "activity",
        type: "activity.snapshot",
        activeThreadId: "thread-1",
        status: "paused",
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
        status: "waiting",
        latestSummary: null,
        waitingRequest: "approval",
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
      }),
    );

    expect(events).toEqual([]);
  });

  it("accepts valid activity changed messages", () => {
    const events: unknown[] = [];
    const client = new ActivitySocketClient({
      url: "ws://127.0.0.1:4317/api/activity",
      onEvent: (event) => events.push(event),
      WebSocketCtor: FakeWebSocket,
    });
    const socket = client.connect() as FakeWebSocket;

    socket.emitMessage(
      JSON.stringify({
        channel: "activity",
        type: "activity.changed",
        activeThreadId: null,
        status: "waiting",
        latestSummary: "Needs permission",
        waitingRequest: "permission",
        error: null,
        updatedAt: "2026-06-08T00:00:00.000Z",
      }),
    );

    expect(events).toEqual([
      {
        channel: "activity",
        type: "activity.changed",
        activeThreadId: null,
        status: "waiting",
        latestSummary: "Needs permission",
        waitingRequest: "permission",
        error: null,
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
    ]);
  });
});
