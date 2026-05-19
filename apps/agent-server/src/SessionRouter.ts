import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type {
  SessionListEntry,
  SessionMessage,
} from "@handagent/core/protocol/SessionMessage.ts";
import type {
  PersistedSession,
  SessionSummary,
} from "@handagent/core/storage/index.ts";
import type { SessionPersistence } from "./SessionPersistence.ts";
import type { SessionRuntimeOrchestrator } from "./SessionRuntimeOrchestrator.ts";

export type PushMessage = (message: SessionMessage) => void;

export class SessionRouter {
  constructor(
    private readonly orchestrator: Pick<SessionRuntimeOrchestrator, "handleUserMessage">,
    private readonly persistence: SessionPersistence,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async createSession(title?: string): Promise<PersistedSession> {
    return this.persistence.createSession(title);
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.persistence.deleteSession(sessionId);
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    return this.persistence.renameSession(sessionId, title);
  }

  async listSessions(): Promise<SessionSummary[]> {
    return this.persistence.listSessions();
  }

  async getSession(sessionId: string): Promise<PersistedSession | null> {
    return this.persistence.getSession(sessionId);
  }

  async getSessionHistory(sessionId: string): Promise<AgentMessage[]> {
    return this.persistence.getMessages(sessionId);
  }

  async receive(message: SessionMessage, push: PushMessage = () => {}): Promise<void> {
    switch (message.type) {
      case "open_session":
        return this.handleOpenSession(message, push);
      case "list_sessions_request":
        return this.handleListSessions(message, push);
      case "load_session_request":
        return this.handleLoadSession(message, push);
      case "delete_session_request":
        return this.handleDeleteSession(message);
      case "user_message":
        return this.orchestrator.handleUserMessage(message, push);
      default:
        return;
    }
  }

  private async handleOpenSession(
    message: Extract<SessionMessage, { type: "open_session" }>,
    push: PushMessage,
  ): Promise<void> {
    const session = await this.persistence.getSession(message.sessionId);
    if (!session) return;

    const messages = await this.persistence.getConversationMessages(message.sessionId);
    push({
      type: "session_snapshot",
      sessionId: message.sessionId,
      messageId: message.messageId,
      timestamp: this.now(),
      payload: {
        messages,
        status: "idle",
      },
    });
  }

  private async handleListSessions(
    message: Extract<SessionMessage, { type: "list_sessions_request" }>,
    push: PushMessage,
  ): Promise<void> {
    const sessions = await this.persistence.listSessions();
    push({
      type: "list_sessions_response",
      sessionId: message.sessionId,
      messageId: message.messageId,
      timestamp: this.now(),
      payload: {
        sessions: sessions.map(toSessionListEntry),
      },
    });
  }

  private async handleLoadSession(
    message: Extract<SessionMessage, { type: "load_session_request" }>,
    push: PushMessage,
  ): Promise<void> {
    const target = await this.persistence.getSession(message.payload.targetSessionId);
    const messages = await this.persistence.getConversationMessages(
      message.payload.targetSessionId,
    );
    push({
      type: "load_session_response",
      sessionId: message.sessionId,
      messageId: message.messageId,
      timestamp: this.now(),
      payload: {
        targetSessionId: message.payload.targetSessionId,
        messages: target ? messages : [],
        title: target?.metadata.title ?? null,
      },
    });
  }

  private async handleDeleteSession(
    message: Extract<SessionMessage, { type: "delete_session_request" }>,
  ): Promise<void> {
    await this.persistence.deleteSession(message.payload.targetSessionId);
  }
}

function toSessionListEntry(summary: SessionSummary): SessionListEntry {
  return {
    id: summary.id,
    title: summary.title,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    messageCount: summary.messageCount,
  };
}
