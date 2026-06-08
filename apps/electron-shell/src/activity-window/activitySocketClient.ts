import type {
  AgentActivityEvent,
  AgentActivityStatus,
  AgentActivityWaitingRequest,
} from "@handagent/core/protocol/AgentActivity.ts";

type WebSocketLike = {
  onmessage: ((event: { data: string }) => void) | null;
  close(): void;
};

type WebSocketConstructor = new (url: string) => WebSocketLike;

export type ActivitySocketClientOptions = {
  url: string;
  onEvent: (event: AgentActivityEvent) => void;
  WebSocketCtor?: WebSocketConstructor;
};

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

  constructor(private readonly options: ActivitySocketClientOptions) {}

  connect(): WebSocketLike {
    this.close();

    const WebSocketCtor =
      this.options.WebSocketCtor ??
      (globalThis.WebSocket as unknown as WebSocketConstructor | undefined);
    if (!WebSocketCtor) {
      throw new Error("WebSocket is not available");
    }

    const socket = new WebSocketCtor(this.options.url);
    socket.onmessage = (event) => {
      const parsed = parseActivityEvent(event.data);
      if (parsed) {
        this.options.onEvent(parsed);
      }
    };
    this.socket = socket;
    return socket;
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
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
