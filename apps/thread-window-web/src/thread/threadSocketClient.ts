import {
  encodeThreadList,
  encodeThreadResume,
  encodeThreadStart,
  encodeTurnStart,
  isServerRequest,
  isThreadNotification,
  type InitialPromptPayload,
  type ServerRequest,
  type ThreadNotification,
} from "../protocol/threadProtocol.ts";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

type WebSocketLike = {
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  send(message: string): void;
  close(): void;
};

type WebSocketConstructor = new (url: string) => WebSocketLike;

export class ThreadSocketClient {
  private socket: WebSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;
  private readonly pendingInitialPrompts = new Map<string, InitialPromptPayload>();

  constructor(private readonly options: {
    url: string;
    WebSocketImpl?: WebSocketConstructor;
    now?: () => string;
    id?: () => string;
    reconnectDelayMs?: number;
    onConnectionState: (state: ConnectionState) => void;
    onNotification: (notification: ThreadNotification) => void;
    onRequest: (request: ServerRequest) => void;
    getOpenThreadIds: () => string[];
  }) {}

  connect(): void {
    this.manuallyClosed = false;
    this.openSocket(this.socket ? "reconnecting" : "connecting");
  }

  disconnect(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.options.onConnectionState("disconnected");
  }

  sendRaw(message: string): void {
    this.socket?.send(message);
  }

  listThreads(): void {
    this.sendRaw(encodeThreadList({
      commandId: this.nextId(),
      timestamp: this.now(),
    }));
  }

  resumeThread(threadId: string): void {
    this.sendRaw(encodeThreadResume({
      threadId,
      commandId: this.nextId(),
      timestamp: this.now(),
    }));
  }

  startInitialPrompt(prompt: InitialPromptPayload): void {
    this.pendingInitialPrompts.set(prompt.clientRequestId, prompt);
    this.sendRaw(encodeThreadStart({
      commandId: prompt.clientRequestId,
      timestamp: this.now(),
      workspaceId: null,
      actionBinding: prompt.actionBinding,
    }));
  }

  startTurn(
    threadId: string,
    text: string,
    attachments: InitialPromptPayload["attachments"] = [],
  ): void {
    this.sendRaw(encodeTurnStart({
      threadId,
      commandId: this.nextId(),
      timestamp: this.now(),
      text,
      attachments,
    }));
  }

  private openSocket(state: ConnectionState): void {
    const WebSocketImpl = this.options.WebSocketImpl ?? (WebSocket as unknown as WebSocketConstructor);
    this.options.onConnectionState(state);
    const socket = new WebSocketImpl(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      this.options.onConnectionState("connected");
      this.listThreads();
      for (const threadId of this.options.getOpenThreadIds()) {
        this.resumeThread(threadId);
      }
    };

    socket.onclose = () => {
      if (this.manuallyClosed) {
        return;
      }
      this.options.onConnectionState("reconnecting");
      this.reconnectTimer = setTimeout(() => {
        this.openSocket("reconnecting");
      }, this.options.reconnectDelayMs ?? 1_000);
    };

    socket.onmessage = (event: { data: string }) => {
      let value: unknown;
      try {
        value = JSON.parse(event.data) as unknown;
      } catch {
        return;
      }

      if (isThreadNotification(value)) {
        this.options.onNotification(value);
        this.handleNotificationSideEffects(value);
      } else if (isServerRequest(value)) {
        this.options.onRequest(value);
      }
    };
  }

  private handleNotificationSideEffects(notification: ThreadNotification): void {
    if (notification.type !== "thread.started" || !notification.commandId) {
      return;
    }

    const pending = this.pendingInitialPrompts.get(notification.commandId);
    if (!pending) {
      return;
    }

    this.pendingInitialPrompts.delete(notification.commandId);
    this.resumeThread(notification.threadId);
    this.startTurn(notification.threadId, pending.text, pending.attachments);
  }

  private now(): string {
    return (this.options.now ?? (() => new Date().toISOString()))();
  }

  private nextId(): string {
    return (this.options.id ?? (() => crypto.randomUUID()))();
  }
}
