import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type {
  AgentRuntimeEvent,
  AgentRunResult,
} from "../../../packages/core/src/runtime/AgentRuntime.ts";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage.ts";
import type {
  SessionStore,
  SessionSummary,
  SessionEvent,
  PersistedSession,
} from "../../../packages/core/src/storage/index.ts";
import { InMemorySessionStore } from "../../../packages/core/src/storage/index.ts";

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
    this.now = options.now ?? (() => new Date().toISOString());
    this.store = options.store ?? new InMemorySessionStore();
  }

  async createSession(title?: string): Promise<PersistedSession> {
    const id = generateSessionId();
    return this.store.create({ id, title, createdAt: this.now() });
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.store.delete(sessionId);
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    return this.store.updateTitle(sessionId, title);
  }

  async listSessions(): Promise<SessionSummary[]> {
    return this.store.list();
  }

  async getSession(sessionId: string): Promise<PersistedSession | null> {
    return this.store.get(sessionId);
  }

  async getSessionHistory(sessionId: string): Promise<AgentMessage[]> {
    const session = await this.store.get(sessionId);
    return session?.messages ?? [];
  }

  async receive(message: SessionMessage, pushMessage?: PushMessage): Promise<void> {
    if (message.type !== "user_message") {
      return;
    }

    let session = await this.store.get(message.sessionId);
    if (!session) {
      session = await this.store.create({
        id: message.sessionId,
        createdAt: this.now(),
      });
    }

    const userMessage: AgentMessage = {
      role: "user",
      content: message.payload.text,
    };
    await this.store.appendMessages(
      message.sessionId,
      [userMessage],
      this.now(),
    );

    const currentSession = (await this.store.get(message.sessionId))!;
    const nextMessages = [...currentSession.messages];

    if (!currentSession.metadata.title && nextMessages.length === 1) {
      const autoTitle = deriveTitle(message.payload.text);
      await this.store.updateTitle(message.sessionId, autoTitle);
    }

    try {
      const events: SessionEvent[] = [];
      const result = await this.runtime.runWithMessages(nextMessages, (event) => {
        const push = pushMessage ?? this.pushMessage;
        push(toSessionMessage(message.sessionId, event, this.now()));
      });

      const newMessages = result.messages.slice(nextMessages.length);
      for (const msg of newMessages) {
        if (msg.role === "assistant" && msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            events.push({
              type: "tool_call",
              timestamp: this.now(),
              toolCallId: tc.id,
              toolName: tc.name,
              input: tc.arguments,
            });
          }
        }
        if (msg.role === "tool") {
          events.push({
            type: "tool_result",
            timestamp: this.now(),
            toolCallId: msg.toolCallId,
            status: "success",
            output: msg.content.slice(0, 500),
          });
        }
      }

      await this.store.setMessages(
        message.sessionId,
        result.messages,
        this.now(),
      );

      if (events.length > 0) {
        await this.store.appendEvents(message.sessionId, events);
      }
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

      await this.store.appendEvents(message.sessionId, [
        {
          type: "error",
          timestamp: this.now(),
          message: toErrorMessage(error),
        },
      ]);
    }
  }
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveTitle(text: string): string {
  const trimmed = text.trim().replace(/\n.*/s, "");
  if (trimmed.length <= 50) return trimmed;
  return trimmed.slice(0, 47) + "...";
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
