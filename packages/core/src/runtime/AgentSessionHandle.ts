import type { UserMessageAttachment } from "../protocol/SessionProtocolShared.ts";
import type { SessionCommand } from "../protocol/SessionCommand.ts";
import type { SessionEvent } from "../protocol/SessionEvent.ts";
import type { AgentMessage } from "./AgentMessage.ts";
import type {
  AgentRunResult,
  AgentRuntimeEvent,
  AgentRuntimeRunOptions,
} from "./AgentRuntime.ts";

type RuntimeLike = {
  runWithMessages(
    messages: AgentMessage[],
    onEvent: (event: AgentRuntimeEvent) => void,
    runOptions?: AgentRuntimeRunOptions,
  ): Promise<AgentRunResult>;
  waitForPendingSummaries?(messages?: AgentMessage[]): Promise<void>;
};

type PersistUserMessageInput = {
  sessionId: string;
  turnId: string;
  messageId: string;
  text: string;
  attachments?: UserMessageAttachment[];
  timestamp: string;
};

type PersistRunResultInput = {
  sessionId: string;
  turnId: string;
  messages: AgentMessage[];
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

type ActiveTurn = {
  turnId: string;
  controller: AbortController;
  runPromise: Promise<void>;
};

export class AgentSessionHandle {
  private readonly queuedEvents: SessionEvent[] = [];
  private readonly pendingReaders: Array<Deferred<SessionEvent>> = [];
  private nextEventId = 0;
  private nextTurnIndex = 0;
  private activeTurn: ActiveTurn | null = null;

  constructor(
    private readonly input: {
      sessionId: string;
      runtime: RuntimeLike;
      loadMessages: (sessionId: string) => Promise<AgentMessage[]>;
      persistUserMessage: (input: PersistUserMessageInput) => Promise<void>;
      persistRunResult: (input: PersistRunResultInput) => Promise<void>;
      now?: () => string;
    },
  ) {}

  async submit(command: SessionCommand): Promise<void> {
    if ("sessionId" in command && command.sessionId !== this.input.sessionId) {
      throw new Error(`Command sessionId mismatch: ${command.sessionId}`);
    }

    switch (command.type) {
      case "turn_start":
        return this.startTurn(command);
      case "turn_interrupt":
        return this.interruptTurn();
      default:
        throw new Error(`Unsupported session handle command: ${command.type}`);
    }
  }

  async nextEvent(): Promise<SessionEvent> {
    const next = this.queuedEvents.shift();
    if (next) return next;

    const deferred = createDeferred<SessionEvent>();
    this.pendingReaders.push(deferred);
    return deferred.promise;
  }

  private async startTurn(
    command: Extract<SessionCommand, { type: "turn_start" }>,
  ): Promise<void> {
    if (this.activeTurn) {
      throw new Error(`Turn already running for session ${this.input.sessionId}`);
    }

    const turnId = `turn-${++this.nextTurnIndex}`;
    const userMessageId = `${turnId}-user`;
    const controller = new AbortController();
    const timestamp = this.now();

    await this.input.persistUserMessage({
      sessionId: this.input.sessionId,
      turnId,
      messageId: userMessageId,
      text: command.payload.text,
      attachments: command.payload.attachments,
      timestamp,
    });

    this.enqueue({
      type: "user_message_recorded",
      sessionId: this.input.sessionId,
      eventId: this.makeEventId(),
      timestamp,
      payload: {
        messageId: userMessageId,
        text: command.payload.text,
      },
    });
    this.enqueue({
      type: "turn_started",
      sessionId: this.input.sessionId,
      eventId: this.makeEventId(),
      turnId,
      timestamp,
      payload: {},
    });

    const runPromise = this.runTurn(turnId, controller, command);
    this.activeTurn = { turnId, controller, runPromise };
    await runPromise;
  }

  private async runTurn(
    turnId: string,
    controller: AbortController,
    command: Extract<SessionCommand, { type: "turn_start" }>,
  ): Promise<void> {
    try {
      const history = await this.input.loadMessages(this.input.sessionId);
      await this.input.runtime.waitForPendingSummaries?.(history);
      const result = await this.input.runtime.runWithMessages(
        history,
        (event) => this.handleRuntimeEvent(turnId, event),
        {
          sessionId: this.input.sessionId,
          signal: controller.signal,
        },
      );

      await this.input.persistRunResult({
        sessionId: this.input.sessionId,
        turnId,
        messages: result.messages,
      });

      this.enqueue({
        type: "turn_completed",
        sessionId: this.input.sessionId,
        eventId: this.makeEventId(),
        turnId,
        timestamp: this.now(),
        payload: { status: "completed" },
      });
      this.enqueue({
        type: "session_status_changed",
        sessionId: this.input.sessionId,
        eventId: this.makeEventId(),
        timestamp: this.now(),
        payload: { value: "idle" },
      });
      void command;
    } catch (error) {
      if (isAbortError(error)) {
        this.enqueue({
          type: "turn_completed",
          sessionId: this.input.sessionId,
          eventId: this.makeEventId(),
          turnId,
          timestamp: this.now(),
          payload: { status: "interrupted" },
        });
        this.enqueue({
          type: "session_status_changed",
          sessionId: this.input.sessionId,
          eventId: this.makeEventId(),
          timestamp: this.now(),
          payload: { value: "interrupted" },
        });
        return;
      }

      this.enqueue({
        type: "session_error",
        sessionId: this.input.sessionId,
        eventId: this.makeEventId(),
        timestamp: this.now(),
        payload: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      this.enqueue({
        type: "turn_completed",
        sessionId: this.input.sessionId,
        eventId: this.makeEventId(),
        turnId,
        timestamp: this.now(),
        payload: { status: "failed" },
      });
      this.enqueue({
        type: "session_status_changed",
        sessionId: this.input.sessionId,
        eventId: this.makeEventId(),
        timestamp: this.now(),
        payload: { value: "failed" },
      });
    } finally {
      if (this.activeTurn?.turnId === turnId) {
        this.activeTurn = null;
      }
    }
  }

  private handleRuntimeEvent(turnId: string, event: AgentRuntimeEvent): void {
    switch (event.type) {
      case "assistant_message_start":
      case "assistant_message_end":
      case "permission_decision":
        return;
      case "assistant_message_delta":
        this.enqueue({
          type: "assistant_delta",
          sessionId: this.input.sessionId,
          eventId: this.makeEventId(),
          turnId,
          itemId: event.messageId,
          timestamp: this.now(),
          payload: { text: event.payload.text },
        });
        return;
      case "tool_call":
        this.enqueue({
          type: "tool_started",
          sessionId: this.input.sessionId,
          eventId: this.makeEventId(),
          turnId,
          itemId: event.toolCallId,
          timestamp: this.now(),
          payload: {
            name: event.toolName,
            input: event.input,
          },
        });
        return;
      case "tool_result":
        this.enqueue({
          type: "tool_finished",
          sessionId: this.input.sessionId,
          eventId: this.makeEventId(),
          turnId,
          itemId: event.toolCallId,
          timestamp: this.now(),
          payload: {
            name: event.toolName,
            status: event.status === "success" ? "completed" : "failed",
            output: event.output,
            durationMs: event.durationMs,
          },
        });
        return;
      case "runtime_error":
        this.enqueue({
          type: "session_error",
          sessionId: this.input.sessionId,
          eventId: this.makeEventId(),
          timestamp: this.now(),
          payload: {
            code: event.code,
            message: event.message,
          },
        });
        return;
    }
  }

  private async interruptTurn(): Promise<void> {
    this.activeTurn?.controller.abort();
    await this.activeTurn?.runPromise;
  }

  private enqueue(event: SessionEvent): void {
    const pendingReader = this.pendingReaders.shift();
    if (pendingReader) {
      pendingReader.resolve(event);
      return;
    }
    this.queuedEvents.push(event);
  }

  private makeEventId(): string {
    this.nextEventId += 1;
    return `${this.input.sessionId}-event-${this.nextEventId}`;
  }

  private now(): string {
    return this.input.now?.() ?? new Date().toISOString();
  }
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
