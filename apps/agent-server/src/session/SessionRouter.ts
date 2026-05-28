import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type {
  SessionListEntry,
  SessionMessage,
} from "@handagent/core/protocol/SessionMessage.ts";
import type {
  PersistedSession,
  SessionActionBinding,
  SessionSummary,
} from "@handagent/core/storage/index.ts";
import type { SessionPersistence } from "./SessionPersistence.ts";
import type { SessionRuntimeOrchestrator } from "./SessionRuntimeOrchestrator.ts";

export type PushMessage = (message: SessionMessage) => void;
type CreateSessionActionBinding = {
  pluginId: string;
  promptName: string;
};
type ActionBindingResolver = {
  resolve(binding: CreateSessionActionBinding): Promise<SessionActionBinding>;
};
type RouterOrchestrator = Pick<SessionRuntimeOrchestrator, "handleUserMessage"> &
  Partial<
    Pick<
      SessionRuntimeOrchestrator,
      "interruptSession" | "interruptAndWait" | "isSessionRunning"
    >
  >;

export class SessionRouter {
  constructor(
    private readonly orchestrator: RouterOrchestrator,
    private readonly persistence: SessionPersistence,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly actionBindingResolver?: ActionBindingResolver,
    private readonly onSessionDeleted?: (sessionId: string) => void,
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
      case "create_session_request":
        return this.handleCreateSession(message, push);
      case "open_session":
        return this.handleOpenSession(message, push);
      case "list_sessions_request":
        return this.handleListSessions(message, push);
      case "load_session_request":
        return this.handleLoadSession(message, push);
      case "delete_session_request":
        return this.handleDeleteSession(message, push);
      case "user_message":
        return this.handleUserMessage(message, push);
      case "interrupt":
        this.orchestrator.interruptSession?.(message.sessionId, push);
        return;
      default:
        console.warn(`[SessionRouter] unhandled message type: ${message.type}`);
        return;
    }
  }

  interruptSession(sessionId: string, push: PushMessage = () => {}): void {
    this.orchestrator.interruptSession?.(sessionId, push);
  }

  private async handleOpenSession(
    message: Extract<SessionMessage, { type: "open_session" }>,
    push: PushMessage,
  ): Promise<void> {
    const session = await this.persistence.getSession(message.sessionId);
    if (!session) {
      push({
        type: "session_open_failed",
        sessionId: message.sessionId,
        messageId: message.messageId,
        timestamp: this.now(),
        payload: {
          reason: "not_found",
          message: `Session not found: ${message.sessionId}`,
        },
      });
      return;
    }

    const recoveredStatus =
      !this.orchestrator.isSessionRunning?.(message.sessionId)
      ? await this.persistence.recoverIncompleteTurnForSnapshot(message.sessionId, this.now())
      : null;
    const messages = await this.persistence.getConversationMessages(message.sessionId);
    push({
      type: "session_snapshot",
      sessionId: message.sessionId,
      messageId: message.messageId,
      timestamp: this.now(),
      payload: {
        messages,
        status: recoveredStatus ?? "idle",
      },
    });
  }

  private async handleCreateSession(
    message: Extract<SessionMessage, { type: "create_session_request" }>,
    push: PushMessage,
  ): Promise<void> {
    let actionBinding: SessionActionBinding | undefined;
    if (message.payload.actionBinding) {
      actionBinding = await this.actionBindingResolver?.resolve(
        message.payload.actionBinding,
      );
      if (!actionBinding) {
        push({
          type: "user_message_failed",
          sessionId: "",
          messageId: message.messageId,
          timestamp: this.now(),
          payload: {
            reason: "invalid_request",
            message: "Action binding resolver is not configured",
          },
        });
        return;
      }
    }

    const session = await this.persistence.createSession(undefined, actionBinding, message.payload.workspaceId);
    const sessionId = session.metadata.id;

    push({
      type: "create_session_response",
      sessionId,
      messageId: message.messageId,
      timestamp: this.now(),
      payload: {
        title: session.metadata.title ?? null,
      },
    });

    const initialText = message.payload.initialText?.trim();
    if (!initialText) return;

    await this.orchestrator.handleUserMessage(
      {
        type: "user_message",
        sessionId,
        messageId: `${message.messageId}-initial-user`,
        timestamp: this.now(),
        payload: {
          text: initialText,
          attachments: message.payload.attachments,
        },
      },
      push,
    );
  }

  private async handleUserMessage(
    message: Extract<SessionMessage, { type: "user_message" }>,
    push: PushMessage,
  ): Promise<void> {
    const session = await this.persistence.getSession(message.sessionId);
    if (!session) {
      push({
        type: "user_message_failed",
        sessionId: message.sessionId,
        messageId: message.messageId,
        timestamp: this.now(),
        payload: {
          reason: "session_not_found",
          message: `Session not found: ${message.sessionId}`,
        },
      });
      return;
    }

    return this.orchestrator.handleUserMessage(message, push);
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
    push: PushMessage,
  ): Promise<void> {
    const targetSessionId = message.payload.targetSessionId;
    const existing = await this.persistence.getSession(targetSessionId);
    if (!existing) {
      push({
        type: "delete_session_response",
        sessionId: message.sessionId,
        messageId: message.messageId,
        timestamp: this.now(),
        payload: {
          targetSessionId,
          status: "not_found",
        },
      });
      return;
    }

    if (this.orchestrator.isSessionRunning?.(targetSessionId)) {
      await this.orchestrator.interruptAndWait?.(targetSessionId, push);
    }

    await this.persistence.deleteSession(targetSessionId);
    this.onSessionDeleted?.(targetSessionId);
    push({
      type: "delete_session_response",
      sessionId: message.sessionId,
      messageId: message.messageId,
      timestamp: this.now(),
      payload: {
        targetSessionId,
        status: "deleted",
      },
    });
  }
}

function toSessionListEntry(summary: SessionSummary): SessionListEntry {
  return {
    id: summary.id,
    title: summary.title,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    messageCount: summary.messageCount,
    workspaceId: summary.workspaceId,
  };
}
