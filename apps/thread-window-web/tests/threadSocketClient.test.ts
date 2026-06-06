import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadSocketClient } from "../src/thread/threadSocketClient.ts";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.onclose?.();
  }
}

describe("ThreadSocketClient", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });

  it("connects, lists threads, resumes open threads, and dispatches inbound notifications", () => {
    const events: string[] = [];
    const client = new ThreadSocketClient({
      url: "ws://127.0.0.1:4317/api/thread",
      WebSocketImpl: FakeWebSocket as never,
      now: () => "2026-06-06T00:00:00.000Z",
      id: vi.fn()
        .mockReturnValueOnce("list-1")
        .mockReturnValueOnce("resume-1"),
      reconnectDelayMs: 0,
      onConnectionState: (state) => events.push(`state:${state}`),
      onNotification: (notification) => events.push(notification.type),
      onRequest: (request) => events.push(request.type),
      getOpenThreadIds: () => ["thread-1"],
    });

    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({
        type: "thread.listed",
        notificationId: "n1",
        timestamp: "2026-06-06T00:00:00.000Z",
        payload: { threads: [] },
      }),
    });

    expect(events).toEqual(["state:connecting", "state:connected", "thread.listed"]);
    expect(socket.sent.map((raw) => JSON.parse(raw))).toMatchObject([
      { type: "thread.list", commandId: "list-1" },
      { type: "thread.resume", threadId: "thread-1", commandId: "resume-1" },
    ]);
  });

  it("sends initial prompt as thread.start then resumes and starts the turn after thread.started", () => {
    const client = new ThreadSocketClient({
      url: "ws://127.0.0.1:4317/api/thread",
      WebSocketImpl: FakeWebSocket as never,
      now: () => "2026-06-06T00:00:00.000Z",
      id: vi.fn()
        .mockReturnValueOnce("list-1")
        .mockReturnValueOnce("resume-1")
        .mockReturnValueOnce("turn-1"),
      reconnectDelayMs: 0,
      onConnectionState: () => {},
      onNotification: () => {},
      onRequest: () => {},
      getOpenThreadIds: () => [],
    });

    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.onopen?.();
    client.startInitialPrompt({
      clientRequestId: "prompt-1",
      text: "hello",
      attachments: [],
      actionBinding: null,
    });
    socket.onmessage?.({
      data: JSON.stringify({
        type: "thread.started",
        threadId: "thread-1",
        notificationId: "n1",
        commandId: "prompt-1",
        timestamp: "2026-06-06T00:00:00.000Z",
        payload: { preview: "hello" },
      }),
    });

    expect(socket.sent.map((raw) => JSON.parse(raw))).toMatchObject([
      { type: "thread.list", commandId: "list-1" },
      { type: "thread.start", commandId: "prompt-1", payload: { actionBinding: null } },
      { type: "thread.resume", threadId: "thread-1", commandId: "resume-1" },
      { type: "turn.start", threadId: "thread-1", commandId: "turn-1", payload: { text: "hello" } },
    ]);
  });

  it("reconnects after an unexpected close", () => {
    vi.useFakeTimers();
    try {
      const events: string[] = [];
      const client = new ThreadSocketClient({
        url: "ws://127.0.0.1:4317/api/thread",
        WebSocketImpl: FakeWebSocket as never,
        now: () => "2026-06-06T00:00:00.000Z",
        id: () => "cmd-1",
        reconnectDelayMs: 25,
        onConnectionState: (state) => events.push(state),
        onNotification: () => {},
        onRequest: () => {},
        getOpenThreadIds: () => [],
      });

      client.connect();
      FakeWebSocket.instances[0].onopen?.();
      FakeWebSocket.instances[0].onclose?.();
      vi.advanceTimersByTime(25);

      expect(events).toEqual(["connecting", "connected", "reconnecting", "reconnecting"]);
      expect(FakeWebSocket.instances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores malformed inbound messages without dispatching callbacks", () => {
    const onNotification = vi.fn();
    const onRequest = vi.fn();
    const client = new ThreadSocketClient({
      url: "ws://127.0.0.1:4317/api/thread",
      WebSocketImpl: FakeWebSocket as never,
      onConnectionState: () => {},
      onNotification,
      onRequest,
      getOpenThreadIds: () => [],
    });

    client.connect();
    const socket = FakeWebSocket.instances[0];

    expect(() => {
      socket.onmessage?.({ data: "not-json" });
      socket.onmessage?.({ data: JSON.stringify({ type: "thread.listed" }) });
      socket.onmessage?.({ data: JSON.stringify({ type: "unknown" }) });
    }).not.toThrow();
    expect(onNotification).not.toHaveBeenCalled();
    expect(onRequest).not.toHaveBeenCalled();
  });
});
