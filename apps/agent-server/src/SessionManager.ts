import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type {
  AgentRuntimeEvent,
  AgentRuntimeRunOptions,
  AgentRunResult,
} from "../../../packages/core/src/runtime/AgentRuntime.ts";
import type {
  SessionMessage,
} from "../../../packages/core/src/protocol/SessionMessage.ts";
import type {
  SessionStore,
  SessionSummary,
  SessionEvent,
  PersistedSession,
} from "../../../packages/core/src/storage/index.ts";
import type { BlobStore } from "../../../packages/core/src/blob/BlobStore.ts";
import { FilesystemBlobStore } from "../../../packages/core/src/blob/FilesystemBlobStore.ts";
import { InMemorySessionStore } from "../../../packages/core/src/storage/index.ts";
import {
  agentMessagesToConversation,
  composeUserContent,
  deriveTitle,
  toAuditEvent,
  toErrorMessage,
  toSessionMessage,
} from "./MessageTranslator.ts";

type RuntimeLike = {
  runWithMessages(
    messages: AgentMessage[],
    onEvent: (event: AgentRuntimeEvent) => void,
    runOptions?: AgentRuntimeRunOptions,
  ): Promise<AgentRunResult>;
  waitForPendingSummaries?(messages?: AgentMessage[]): Promise<void>;
};

type PushMessage = (message: SessionMessage) => void;
type SessionManagerOptions = {
  now?: () => string;
  store?: SessionStore;
  blobStore?: BlobStore;
};

export class SessionManager {
  private readonly now: () => string;
  private readonly store: SessionStore;
  private readonly blobStore: BlobStore;

  constructor(
    private readonly runtime: RuntimeLike,
    private readonly pushMessage: PushMessage = () => {},
    options: SessionManagerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.store = options.store ?? new InMemorySessionStore();
    this.blobStore = options.blobStore ?? new FilesystemBlobStore();
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

    const composedText = await composeUserContent(
      message.payload.text,
      message.payload.attachments,
      this.blobStore,
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
    await this.runtime.waitForPendingSummaries?.(currentSession.messages);
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
