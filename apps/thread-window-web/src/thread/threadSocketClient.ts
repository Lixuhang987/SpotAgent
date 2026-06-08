import {
  encodeThreadList,
  encodeThreadResume,
  encodeThreadStart,
  encodeInputSubmit,
  encodeWorkspaceList,
  isServerRequest,
  isThreadNotification,
  type InitialPromptPayload,
  type ServerRequest,
  type ThreadNotification,
} from "../protocol/threadProtocol.ts";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

type WebSocketLike = {
  readyState: number;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  send(message: string): void;
  close(): void;
};

type WebSocketConstructor = new (url: string) => WebSocketLike;

const WS_CONNECTING = 0;
const WS_OPEN = 1;

export class ThreadSocketClient {
  private socket: WebSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;
  private outboundQueue: string[] = [];
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
    if (this.hasActiveSocket()) {
      return;
    }
    this.openSocket(this.socket ? "reconnecting" : "connecting");
  }

  disconnect(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = null;
    this.outboundQueue = [];
    this.socket?.close();
    this.socket = null;
    this.options.onConnectionState("disconnected");
  }

  sendRaw(message: string): void {
    if (this.socket?.readyState === WS_OPEN) {
      this.socket.send(message);
      return;
    }
    this.outboundQueue.push(message);
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
    if (this.pendingInitialPrompts.has(prompt.clientRequestId)) {
      throw new Error(`Initial prompt ${prompt.clientRequestId} is already pending`);
    }
    this.pendingInitialPrompts.set(prompt.clientRequestId, prompt);
    this.sendRaw(encodeThreadStart({
      commandId: prompt.clientRequestId,
      timestamp: this.now(),
      workspaceId: null,
      actionBinding: prompt.actionBinding,
    }));
  }

  submitInput(
    threadId: string,
    text: string,
    attachments: InitialPromptPayload["attachments"] = [],
  ): void {
    this.sendRaw(encodeInputSubmit({
      threadId,
      inputId: this.nextId(),
      timestamp: this.now(),
      text,
      attachments,
    }));
  }

  private openSocket(state: ConnectionState): void {
    const WebSocketImpl = this.options.WebSocketImpl ?? (WebSocket as unknown as WebSocketConstructor);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = null;
    this.options.onConnectionState(state);
    const socket = new WebSocketImpl(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      if (socket !== this.socket) {
        return;
      }
      this.options.onConnectionState("connected");
      this.flushOutboundQueue(socket);
      this.sendRaw(encodeWorkspaceList({
        commandId: this.nextId(),
        timestamp: this.now(),
      }));
      this.listThreads();
      for (const threadId of this.options.getOpenThreadIds()) {
        this.resumeThread(threadId);
      }
    };

    socket.onclose = () => {
      if (socket !== this.socket || this.manuallyClosed) {
        return;
      }
      if (this.reconnectTimer) {
        return;
      }
      this.options.onConnectionState("reconnecting");
      this.reconnectTimer = setTimeout(() => {
        this.openSocket("reconnecting");
      }, this.options.reconnectDelayMs ?? 1_000);
    };

    socket.onmessage = (event: { data: string }) => {
      if (socket !== this.socket) {
        return;
      }
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
    if (notification.type === "thread.error") {
      if (notification.commandId) {
        this.pendingInitialPrompts.delete(notification.commandId);
      }
      return;
    }

    if (notification.type !== "thread.started" || !notification.commandId) {
      return;
    }

    const pending = this.pendingInitialPrompts.get(notification.commandId);
    if (!pending) {
      return;
    }

    this.pendingInitialPrompts.delete(notification.commandId);
    this.resumeThread(notification.threadId);
    this.submitInput(notification.threadId, pending.text, pending.attachments);
  }

  private hasActiveSocket(): boolean {
    return this.socket?.readyState === WS_CONNECTING || this.socket?.readyState === WS_OPEN;
  }

  private flushOutboundQueue(socket: WebSocketLike): void {
    while (this.outboundQueue.length > 0 && socket === this.socket && socket.readyState === WS_OPEN) {
      const message = this.outboundQueue.shift();
      if (message) {
        socket.send(message);
      }
    }
  }

  private now(): string {
    return (this.options.now ?? (() => new Date().toISOString()))();
  }

  private nextId(): string {
    return (this.options.id ?? (() => crypto.randomUUID()))();
  }
}
