import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type {
  AgentRuntimeEvent,
  AgentRuntimeRunOptions,
  AgentRunResult,
} from "../../../packages/core/src/runtime/AgentRuntime.ts";
import type {
  SessionMessage,
  UserMessageAttachment,
} from "../../../packages/core/src/protocol/SessionMessage.ts";
import type { ConversationMessage } from "../../../packages/core/src/conversation/ConversationMessage.ts";
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
    runOptions?: AgentRuntimeRunOptions,
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
    const push = pushMessage ?? this.pushMessage;

    if (message.type === "list_sessions_request") {
      const sessions = await this.store.list();
      push({
        type: "list_sessions_response",
        sessionId: message.sessionId,
        messageId: message.messageId,
        timestamp: this.now(),
        payload: {
          sessions: sessions.map((s) => ({
            id: s.id,
            title: s.title,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            messageCount: s.messageCount,
          })),
        },
      });
      return;
    }

    if (message.type === "load_session_request") {
      const target = await this.store.get(message.payload.targetSessionId);
      push({
        type: "load_session_response",
        sessionId: message.sessionId,
        messageId: message.messageId,
        timestamp: this.now(),
        payload: {
          targetSessionId: message.payload.targetSessionId,
          messages: target ? agentMessagesToConversation(target.messages) : [],
          title: target?.metadata.title ?? null,
        },
      });
      return;
    }

    if (message.type === "delete_session_request") {
      await this.store.delete(message.payload.targetSessionId);
      return;
    }

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

    const composedText = composeUserContent(
      message.payload.text,
      message.payload.attachments,
    );

    const userMessage: AgentMessage = {
      role: "user",
      content: composedText,
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
      const result = await this.runtime.runWithMessages(
        nextMessages,
        (event) => {
          const push = pushMessage ?? this.pushMessage;
          const sessionMessage = toSessionMessage(message.sessionId, event, this.now());
          if (sessionMessage) {
            push(sessionMessage);
          }
          const auditEvent = toAuditEvent(event, this.now());
          if (auditEvent) {
            events.push(auditEvent);
          }
        },
        { sessionId: message.sessionId },
      );

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

function composeUserContent(
  text: string,
  attachments: UserMessageAttachment[] | undefined,
): string {
  if (!attachments || attachments.length === 0) return text;
  const parts: string[] = [text];
  for (const attachment of attachments) {
    if (attachment.kind === "text_selection") {
      parts.push(`[选区]\n${attachment.text}`);
    } else if (attachment.kind === "image") {
      parts.push(`[图片附件: ${attachment.mimeType} (${attachment.id})]`);
    }
  }
  return parts.join("\n\n");
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
):
  | Extract<
      SessionMessage,
      | { type: "assistant_message_start" }
      | { type: "assistant_message_delta" }
      | { type: "assistant_message_end" }
    >
  | null {
  switch (event.type) {
    case "assistant_message_start":
      return {
        type: "assistant_message_start",
        sessionId,
        messageId: `${sessionId}-${event.messageId}`,
        timestamp,
        payload: event.payload,
      };
    case "assistant_message_delta":
      return {
        type: "assistant_message_delta",
        sessionId,
        messageId: `${sessionId}-${event.messageId}`,
        timestamp,
        payload: event.payload,
      };
    case "assistant_message_end":
      return {
        type: "assistant_message_end",
        sessionId,
        messageId: `${sessionId}-${event.messageId}`,
        timestamp,
        payload: event.payload,
      };
    case "tool_call":
    case "tool_result":
    case "runtime_error":
      return null;
  }
}

function agentMessagesToConversation(messages: AgentMessage[]): ConversationMessage[] {
  return messages.map((msg, idx) => {
    const id = `msg-${idx}`;
    const now = new Date(0).toISOString();
    if (msg.role === "tool") {
      return {
        id,
        role: "tool",
        text: msg.content,
        status: "completed",
        createdAt: now,
        updatedAt: now,
        toolCall: { name: msg.name },
      };
    }
    return {
      id,
      role: msg.role,
      text: typeof msg.content === "string" ? msg.content : "",
      status: "completed",
      createdAt: now,
      updatedAt: now,
    };
  });
}

function toAuditEvent(event: AgentRuntimeEvent, timestamp: string): SessionEvent | null {
  switch (event.type) {
    case "tool_call":
      return {
        type: "tool_call",
        timestamp,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.input,
      };
    case "tool_result":
      return {
        type: "tool_result",
        timestamp,
        toolCallId: event.toolCallId,
        status: event.status,
        output: event.output,
        durationMs: event.durationMs,
      };
    case "permission_decision":
      return {
        type: "permission_request",
        timestamp,
        toolName: event.toolName,
        action: event.decision,
        granted: event.decision === "allow",
      };
    case "runtime_error":
      return {
        type: "error",
        timestamp,
        message: event.message,
        code: event.code,
      };
    default:
      return null;
  }
}
