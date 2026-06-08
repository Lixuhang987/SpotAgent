import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadSocketClient } from "../src/thread/threadSocketClient.ts";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  sent: string[] = [];
  readyState = FakeWebSocket.CONNECTING;
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
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
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
        .mockReturnValueOnce("workspace-list-1")
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
    socket.open();
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
      { type: "workspace.list", commandId: "workspace-list-1" },
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
        .mockReturnValueOnce("workspace-list-1")
        .mockReturnValueOnce("list-1")
        .mockReturnValueOnce("resume-1")
        .mockReturnValueOnce("input-1"),
      reconnectDelayMs: 0,
      onConnectionState: () => {},
      onNotification: () => {},
      onRequest: () => {},
      getOpenThreadIds: () => [],
    });

    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
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
      { type: "workspace.list", commandId: "workspace-list-1" },
      { type: "thread.list", commandId: "list-1" },
      { type: "thread.start", commandId: "prompt-1", payload: { actionBinding: null, workspaceId: null } },
      { type: "thread.resume", threadId: "thread-1", commandId: "resume-1" },
      { type: "input.submit", threadId: "thread-1", inputId: "input-1", payload: { text: "hello" } },
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
      FakeWebSocket.instances[0].open();
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

  it("keeps connect idempotent while connecting or connected", () => {
    const client = new ThreadSocketClient({
      url: "ws://127.0.0.1:4317/api/thread",
      WebSocketImpl: FakeWebSocket as never,
      now: () => "2026-06-06T00:00:00.000Z",
      id: vi.fn()
        .mockReturnValueOnce("workspace-list-1")
        .mockReturnValueOnce("list-1")
        .mockReturnValueOnce("resume-1"),
      reconnectDelayMs: 0,
      onConnectionState: () => {},
      onNotification: () => {},
      onRequest: () => {},
      getOpenThreadIds: () => ["thread-1"],
    });

    client.connect();
    client.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);

    const socket = FakeWebSocket.instances[0];
    socket.open();
    client.connect();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(socket.sent.map((raw) => JSON.parse(raw))).toMatchObject([
      { type: "workspace.list", commandId: "workspace-list-1" },
      { type: "thread.list", commandId: "list-1" },
      { type: "thread.resume", threadId: "thread-1", commandId: "resume-1" },
    ]);
  });

  it("ignores stale socket messages and closes after a reconnect starts", () => {
    vi.useFakeTimers();
    try {
      const onNotification = vi.fn();
      const client = new ThreadSocketClient({
        url: "ws://127.0.0.1:4317/api/thread",
        WebSocketImpl: FakeWebSocket as never,
        now: () => "2026-06-06T00:00:00.000Z",
        id: () => "cmd-1",
        reconnectDelayMs: 25,
        onConnectionState: () => {},
        onNotification,
        onRequest: () => {},
        getOpenThreadIds: () => [],
      });

      client.connect();
      const staleSocket = FakeWebSocket.instances[0];
      staleSocket.open();
      staleSocket.onclose?.();
      vi.advanceTimersByTime(25);
      const activeSocket = FakeWebSocket.instances[1];
      activeSocket.open();

      staleSocket.onmessage?.({
        data: JSON.stringify({
          type: "thread.listed",
          notificationId: "n-stale",
          timestamp: "2026-06-06T00:00:00.000Z",
          payload: { threads: [] },
        }),
      });
      staleSocket.onclose?.();
      vi.advanceTimersByTime(25);

      expect(onNotification).not.toHaveBeenCalled();
      expect(FakeWebSocket.instances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears a scheduled reconnect timer when connect starts a replacement socket", () => {
    vi.useFakeTimers();
    try {
      const client = new ThreadSocketClient({
        url: "ws://127.0.0.1:4317/api/thread",
        WebSocketImpl: FakeWebSocket as never,
        now: () => "2026-06-06T00:00:00.000Z",
        id: () => "cmd-1",
        reconnectDelayMs: 25,
        onConnectionState: () => {},
        onNotification: () => {},
        onRequest: () => {},
        getOpenThreadIds: () => [],
      });

      client.connect();
      const staleSocket = FakeWebSocket.instances[0];
      staleSocket.open();
      staleSocket.readyState = FakeWebSocket.CLOSED;
      staleSocket.onclose?.();

      client.connect();
      vi.advanceTimersByTime(25);

      expect(FakeWebSocket.instances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("queues initial prompt commands before open and flushes them on open", () => {
    const client = new ThreadSocketClient({
      url: "ws://127.0.0.1:4317/api/thread",
      WebSocketImpl: FakeWebSocket as never,
      now: () => "2026-06-06T00:00:00.000Z",
      id: vi.fn()
        .mockReturnValueOnce("workspace-list-1")
        .mockReturnValueOnce("list-1")
        .mockReturnValueOnce("resume-1")
        .mockReturnValueOnce("input-1"),
      reconnectDelayMs: 0,
      onConnectionState: () => {},
      onNotification: () => {},
      onRequest: () => {},
      getOpenThreadIds: () => [],
    });

    client.connect();
    const socket = FakeWebSocket.instances[0];

    expect(() => client.startInitialPrompt({
      clientRequestId: "prompt-1",
      text: "hello before open",
      attachments: [],
      actionBinding: null,
    })).not.toThrow();
    expect(socket.sent).toEqual([]);

    socket.open();
    socket.onmessage?.({
      data: JSON.stringify({
        type: "thread.started",
        threadId: "thread-1",
        notificationId: "n1",
        commandId: "prompt-1",
        timestamp: "2026-06-06T00:00:00.000Z",
        payload: { preview: "hello before open" },
      }),
    });

    expect(socket.sent.map((raw) => JSON.parse(raw))).toMatchObject([
      { type: "thread.start", commandId: "prompt-1", payload: { actionBinding: null, workspaceId: null } },
      { type: "workspace.list", commandId: "workspace-list-1" },
      { type: "thread.list", commandId: "list-1" },
      { type: "thread.resume", threadId: "thread-1", commandId: "resume-1" },
      { type: "input.submit", threadId: "thread-1", inputId: "input-1", payload: { text: "hello before open" } },
    ]);
  });

  it("clears reconnect timers and queued messages on disconnect without reconnecting", () => {
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
      const socket = FakeWebSocket.instances[0];
      client.submitInput("thread-1", "queued before open");
      socket.onclose?.();
      client.disconnect();
      vi.advanceTimersByTime(25);

      expect(FakeWebSocket.instances).toHaveLength(1);
      expect(socket.sent).toEqual([]);
      expect(events.at(-1)).toBe("disconnected");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears pending initial prompt on matching thread error and ignores later started with same command id", () => {
    const client = new ThreadSocketClient({
      url: "ws://127.0.0.1:4317/api/thread",
      WebSocketImpl: FakeWebSocket as never,
      now: () => "2026-06-06T00:00:00.000Z",
      id: vi.fn()
        .mockReturnValueOnce("workspace-list-1")
        .mockReturnValueOnce("list-1")
        .mockReturnValueOnce("resume-1")
        .mockReturnValueOnce("input-1"),
      reconnectDelayMs: 0,
      onConnectionState: () => {},
      onNotification: () => {},
      onRequest: () => {},
      getOpenThreadIds: () => [],
    });

    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    client.startInitialPrompt({
      clientRequestId: "prompt-1",
      text: "hello",
      attachments: [],
      actionBinding: null,
    });

    socket.onmessage?.({
      data: JSON.stringify({
        type: "thread.started",
        threadId: "thread-other",
        notificationId: "n-other-started",
        commandId: "prompt-other",
        timestamp: "2026-06-06T00:00:00.000Z",
        payload: { preview: "other" },
      }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        type: "thread.error",
        notificationId: "n-other-error",
        commandId: "prompt-other",
        timestamp: "2026-06-06T00:00:00.000Z",
        payload: { message: "other failed" },
      }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        type: "thread.error",
        notificationId: "n-error",
        commandId: "prompt-1",
        timestamp: "2026-06-06T00:00:00.000Z",
        payload: { message: "failed" },
      }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        type: "thread.started",
        threadId: "thread-1",
        notificationId: "n-late-started",
        commandId: "prompt-1",
        timestamp: "2026-06-06T00:00:00.000Z",
        payload: { preview: "hello" },
      }),
    });

    const sent = socket.sent.map((raw) => JSON.parse(raw));
    expect(sent).toMatchObject([
      { type: "workspace.list", commandId: "workspace-list-1" },
      { type: "thread.list", commandId: "list-1" },
      { type: "thread.start", commandId: "prompt-1", payload: { actionBinding: null, workspaceId: null } },
    ]);
    expect(sent.some((command) => command.type === "input.submit")).toBe(false);
    expect(sent.some((command) => command.type === "thread.resume" && command.threadId === "thread-1")).toBe(false);
  });

  it("rejects duplicate initial prompt clientRequestId without overwriting pending prompt", () => {
    const client = new ThreadSocketClient({
      url: "ws://127.0.0.1:4317/api/thread",
      WebSocketImpl: FakeWebSocket as never,
      now: () => "2026-06-06T00:00:00.000Z",
      id: vi.fn()
        .mockReturnValueOnce("workspace-list-1")
        .mockReturnValueOnce("list-1")
        .mockReturnValueOnce("resume-1")
        .mockReturnValueOnce("input-1"),
      reconnectDelayMs: 0,
      onConnectionState: () => {},
      onNotification: () => {},
      onRequest: () => {},
      getOpenThreadIds: () => [],
    });

    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    client.startInitialPrompt({
      clientRequestId: "prompt-1",
      text: "first",
      attachments: [],
      actionBinding: null,
    });

    expect(() => client.startInitialPrompt({
      clientRequestId: "prompt-1",
      text: "second",
      attachments: [],
      actionBinding: null,
    })).toThrow(/already pending/);

    socket.onmessage?.({
      data: JSON.stringify({
        type: "thread.started",
        threadId: "thread-1",
        notificationId: "n1",
        commandId: "prompt-1",
        timestamp: "2026-06-06T00:00:00.000Z",
        payload: { preview: "first" },
      }),
    });

    expect(socket.sent.map((raw) => JSON.parse(raw))).toMatchObject([
      { type: "workspace.list", commandId: "workspace-list-1" },
      { type: "thread.list", commandId: "list-1" },
      { type: "thread.start", commandId: "prompt-1", payload: { actionBinding: null, workspaceId: null } },
      { type: "thread.resume", threadId: "thread-1", commandId: "resume-1" },
      { type: "input.submit", threadId: "thread-1", inputId: "input-1", payload: { text: "first" } },
    ]);
  });
});
