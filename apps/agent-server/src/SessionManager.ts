import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type {
  AgentRuntimeEvent,
  AgentRunResult,
} from "../../../packages/core/src/runtime/AgentRuntime.ts";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage.ts";
import { InMemorySessionStore, type SessionStore } from "./SessionStore.ts";

type RuntimeLike = {
  runWithMessages(
    messages: AgentMessage[],
    onEvent: (event: AgentRuntimeEvent) => void,
  ): Promise<AgentRunResult>;
};

type PushMessage = (message: SessionMessage) => void;
type SessionManagerOptions = {
  now?: () => string;
  store?: SessionStore;
};

export class SessionManager {
  private readonly now: () => string;
  private readonly store: SessionStore;

  constructor(
    private readonly runtime: RuntimeLike,
    private readonly pushMessage: PushMessage = () => {},
    options: SessionManagerOptions = {},
  ) {
    this.now = options.now ?? (() => "2026-05-11T00:00:00.000Z");
    this.store = options.store ?? new InMemorySessionStore();
  }

  getSessionMessages(sessionId: string): AgentMessage[] {
    return this.store.getSessionHistory(sessionId);
  }

  listSessions() {
    return this.store.listSessions();
  }

  getSessionHistory(sessionId: string): AgentMessage[] {
    return this.store.getSessionHistory(sessionId);
  }

  async receive(message: SessionMessage, pushMessage?: PushMessage): Promise<void> {
    if (message.type !== "user_message") {
      return;
    }

    const session = this.store.get(message.sessionId) ?? {
      sessionId: message.sessionId,
      messages: [],
      updatedAt: this.now(),
    };
    const nextMessages = [
      ...session.messages,
      {
        role: "user" as const,
        content: message.payload.text,
      },
    ];

    this.store.save({
      sessionId: message.sessionId,
      messages: nextMessages,
      updatedAt: this.now(),
    });

    try {
      const result = await this.runtime.runWithMessages(nextMessages, (event) => {
        const push = pushMessage ?? this.pushMessage;
        push(toSessionMessage(message.sessionId, event, this.now()));
      });

      this.store.save({
        sessionId: message.sessionId,
        messages: result.messages,
        updatedAt: this.now(),
      });
    } catch (error) {
      const push = pushMessage ?? this.pushMessage;
      push({
        type: "error",
        sessionId: message.sessionId,
        messageId: `${message.sessionId}-error`,
        timestamp: this.now(),
        payload: {
          message: toErrorMessage(error),
        },
      });
    }
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Agent runtime failed.";
}

function toSessionMessage(
  sessionId: string,
  event: AgentRuntimeEvent,
  timestamp: string,
): Extract<
  SessionMessage,
  | { type: "assistant_message_start" }
  | { type: "assistant_message_delta" }
  | { type: "assistant_message_end" }
> {
  const messageId = `${sessionId}-${event.messageId}`;

  switch (event.type) {
    case "assistant_message_start":
      return {
        type: "assistant_message_start",
        sessionId,
        messageId,
        timestamp,
        payload: event.payload,
      };
    case "assistant_message_delta":
      return {
        type: "assistant_message_delta",
        sessionId,
        messageId,
        timestamp,
        payload: event.payload,
      };
    case "assistant_message_end":
      return {
        type: "assistant_message_end",
        sessionId,
        messageId,
        timestamp,
        payload: event.payload,
      };
  }
}
