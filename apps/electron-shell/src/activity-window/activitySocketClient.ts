import type {
  AgentActivityEvent,
  AgentActivityStatus,
  AgentActivityWaitingRequest,
} from "@handagent/core/protocol/AgentActivity.ts";

type WebSocketLike = {
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
};

type WebSocketConstructor = new (url: string) => WebSocketLike;

export type ActivitySocketClientOptions = {
  url: string;
  onEvent: (event: AgentActivityEvent) => void;
  WebSocketCtor?: WebSocketConstructor;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  setTimeoutFn?: (callback: () => void, delayMs: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
};

const defaultReconnectDelayMs = 1000;
const defaultMaxReconnectAttempts = 20;

const statuses = new Set<AgentActivityStatus>([
  "idle",
  "starting",
  "running",
  "tool_running",
  "waiting",
  "completed",
  "error",
]);

const waitingRequests = new Set<AgentActivityWaitingRequest>([
  "permission",
  "workspace",
]);

export class ActivitySocketClient {
  private socket: WebSocketLike | null = null;
  private manuallyClosed = true;
  private reconnectAttempts = 0;
  private reconnectTimer: unknown | null = null;

  constructor(private readonly options: ActivitySocketClientOptions) {}

  connect(): WebSocketLike {
    this.manuallyClosed = false;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.detachAndCloseSocket();

    return this.createSocket();
  }

  close(): void {
    this.manuallyClosed = true;
    this.clearReconnectTimer();
    this.detachAndCloseSocket();
  }

  private createSocket(): WebSocketLike {
    const WebSocketCtor =
      this.options.WebSocketCtor ??
      (globalThis.WebSocket as unknown as WebSocketConstructor | undefined);
    if (!WebSocketCtor) {
      throw new Error("WebSocket is not available");
    }

    const socket = new WebSocketCtor(this.options.url);
    socket.onmessage = (event) => {
      if (socket !== this.socket || this.manuallyClosed) {
        return;
      }

      const parsed = parseActivityEvent(event.data);
      if (parsed) {
        this.options.onEvent(parsed);
      }
    };
    socket.onclose = () => {
      this.scheduleReconnect(socket);
    };
    socket.onerror = () => {
      this.scheduleReconnect(socket);
    };
    this.socket = socket;
    return socket;
  }

  private scheduleReconnect(socket: WebSocketLike): void {
    if (
      socket !== this.socket ||
      this.manuallyClosed ||
      this.reconnectTimer !== null ||
      this.reconnectAttempts >= this.maxReconnectAttempts
    ) {
      return;
    }

    this.reconnectAttempts += 1;
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      if (this.manuallyClosed) {
        return;
      }

      this.detachAndCloseSocket();
      this.createSocket();
    }, this.reconnectDelayMs);
  }

  private detachAndCloseSocket(): void {
    const socket = this.socket;
    if (!socket) {
      return;
    }

    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.close();
    this.socket = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) {
      return;
    }

    this.clearTimeoutFn(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private get reconnectDelayMs(): number {
    return this.options.reconnectDelayMs ?? defaultReconnectDelayMs;
  }

  private get maxReconnectAttempts(): number {
    return this.options.maxReconnectAttempts ?? defaultMaxReconnectAttempts;
  }

  private get setTimeoutFn(): (
    callback: () => void,
    delayMs: number,
  ) => unknown {
    return (
      this.options.setTimeoutFn ??
      ((callback, delayMs) => globalThis.setTimeout(callback, delayMs))
    );
  }

  private get clearTimeoutFn(): (handle: unknown) => void {
    return (
      this.options.clearTimeoutFn ??
      ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>))
    );
  }
}

function parseActivityEvent(data: string): AgentActivityEvent | null {
  try {
    const value: unknown = JSON.parse(data);
    return isAgentActivityEvent(value) ? value : null;
  } catch {
    return null;
  }
}

function isAgentActivityEvent(value: unknown): value is AgentActivityEvent {
  if (!isRecord(value)) return false;

  return (
    value.channel === "activity" &&
    (value.type === "activity.snapshot" || value.type === "activity.changed") &&
    isNullableString(value.activeThreadId) &&
    typeof value.status === "string" &&
    statuses.has(value.status as AgentActivityStatus) &&
    isNullableString(value.latestSummary) &&
    isWaitingRequest(value.waitingRequest) &&
    isNullableString(value.error) &&
    typeof value.updatedAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isWaitingRequest(
  value: unknown,
): value is AgentActivityWaitingRequest | null {
  return (
    value === null ||
    (typeof value === "string" &&
      waitingRequests.has(value as AgentActivityWaitingRequest))
  );
}
