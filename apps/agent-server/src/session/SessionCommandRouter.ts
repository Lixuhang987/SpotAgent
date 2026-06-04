import type { SessionCommand } from "@handagent/core/protocol/SessionCommand.ts";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { SessionEvent } from "@handagent/core/protocol/SessionEvent.ts";
import type {
  PersistedSession,
  SessionActionBinding,
  SessionSummary,
} from "@handagent/core/storage/index.ts";
import { SessionEventPublisher } from "./SessionEventPublisher.ts";
import type { SessionPersistence } from "./SessionPersistence.ts";
import type { SessionRuntimeOrchestrator } from "./SessionRuntimeOrchestrator.ts";

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

type ResponseHandlers = {
  onPermissionResponse?: (
    response: Extract<ClientResponse, { type: "permission_answer" }>,
    connectionId: string,
  ) => void;
  onWorkspaceResponse?: (
    response: Extract<ClientResponse, { type: "workspace_answer" }>,
    connectionId: string,
  ) => void;
};

export class SessionCommandRouter {
  constructor(
    private readonly orchestrator: RouterOrchestrator,
    private readonly persistence: SessionPersistence,
    private readonly publisher: SessionEventPublisher,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly actionBindingResolver?: ActionBindingResolver,
    private readonly onSessionDeleted?: (sessionId: string) => void,
    private readonly responseHandlers: ResponseHandlers = {},
  ) {}

  async receive(command: SessionCommand, connectionId: string): Promise<void> {
    switch (command.type) {
      case "session_create":
        return this.handleCreateSession(command, connectionId);
      case "session_subscribe":
        return this.handleSubscribe(command, connectionId);
      case "session_unsubscribe":
        this.publisher.unsubscribe(connectionId, command.sessionId);
        return;
      case "turn_start":
        return this.handleTurnStart(command);
      case "turn_interrupt":
        this.interruptSession(command.sessionId);
        return;
      case "sessions_list":
        return this.handleListSessions(command, connectionId);
      case "session_delete":
        return this.handleDeleteSession(command, connectionId);
    }
  }

  handleResponse(response: ClientResponse, connectionId: string): void {
    switch (response.type) {
      case "permission_answer":
        this.responseHandlers.onPermissionResponse?.(response, connectionId);
        return;
      case "workspace_answer":
        this.responseHandlers.onWorkspaceResponse?.(response, connectionId);
        return;
    }
  }

  interruptSession(sessionId: string): void {
    this.orchestrator.interruptSession?.(sessionId, (event) => {
      this.publisher.publish(event);
    });
  }

  private async handleCreateSession(
    command: Extract<SessionCommand, { type: "session_create" }>,
    connectionId: string,
  ): Promise<void> {
    let actionBinding: SessionActionBinding | undefined;
    if (command.payload.actionBinding) {
      actionBinding = await this.actionBindingResolver?.resolve(
        command.payload.actionBinding,
      );
      if (!actionBinding) {
        this.publisher.publishToConnection(connectionId, {
          type: "session_error",
          eventId: this.makeEventId(),
          commandId: command.commandId,
          timestamp: this.now(),
          payload: {
            code: "invalid_request",
            message: "Action binding resolver is not configured",
          },
        });
        return;
      }
    }

    const session = await this.persistence.createSession(
      undefined,
      actionBinding,
      command.payload.workspaceId,
    );
    const sessionId = session.metadata.id;
    this.publisher.subscribe(connectionId, sessionId);
    this.publisher.publishToConnection(connectionId, {
      type: "session_created",
      sessionId,
      eventId: this.makeEventId(),
      commandId: command.commandId,
      timestamp: this.now(),
      payload: { title: session.metadata.title ?? null },
    });

    const initialText = command.payload.initialText?.trim();
    if (!initialText) return;

    await this.handleTurnStart({
      type: "turn_start",
      sessionId,
      commandId: `${command.commandId}:initial`,
      timestamp: command.timestamp,
      payload: {
        text: initialText,
        attachments: command.payload.attachments,
      },
    }, connectionId);
  }

  private async handleSubscribe(
    command: Extract<SessionCommand, { type: "session_subscribe" }>,
    connectionId: string,
  ): Promise<void> {
    this.publisher.subscribe(connectionId, command.sessionId);
    const session = await this.persistence.getSession(command.sessionId);
    if (!session) {
      this.publisher.publishToConnection(connectionId, {
        type: "session_error",
        sessionId: command.sessionId,
        eventId: this.makeEventId(),
        commandId: command.commandId,
        timestamp: this.now(),
        payload: {
          code: "not_found",
          message: `Session not found: ${command.sessionId}`,
        },
      });
      return;
    }

    const recoveredStatus =
      !this.orchestrator.isSessionRunning?.(command.sessionId)
      ? await this.persistence.recoverIncompleteTurnForSnapshot(command.sessionId, this.now())
      : null;
    const messages = await this.persistence.getConversationMessages(command.sessionId);

    this.publisher.publishToConnection(connectionId, {
      type: "session_snapshot",
      sessionId: command.sessionId,
      eventId: this.makeEventId(),
      commandId: command.commandId,
      timestamp: this.now(),
      payload: {
        messages,
        status: recoveredStatus ?? "idle",
      },
    });
  }

  private async handleTurnStart(
    command: Extract<SessionCommand, { type: "turn_start" }>,
    connectionId?: string,
  ): Promise<void> {
    if (!(await this.persistence.getSession(command.sessionId))) {
      const errorEvent: SessionEvent = {
        type: "session_error",
        sessionId: command.sessionId,
        eventId: this.makeEventId(),
        commandId: command.commandId,
        timestamp: this.now(),
        payload: {
          code: "session_not_found",
          message: `Session not found: ${command.sessionId}`,
        },
      };
      if (connectionId) {
        this.publisher.publishToConnection(connectionId, errorEvent);
      } else {
        this.publisher.publish(errorEvent);
      }
      return;
    }

    await this.orchestrator.handleUserMessage(
      {
        sessionId: command.sessionId,
        messageId: command.commandId,
        timestamp: command.timestamp,
        payload: {
          text: command.payload.text,
          attachments: command.payload.attachments,
        },
      },
      (event) => {
        this.publisher.publish(event);
      },
    );
  }

  private async handleListSessions(
    command: Extract<SessionCommand, { type: "sessions_list" }>,
    connectionId: string,
  ): Promise<void> {
    const sessions = await this.persistence.listSessions();
    this.publisher.publishToConnection(connectionId, {
      type: "sessions_listed",
      eventId: this.makeEventId(),
      commandId: command.commandId,
      timestamp: this.now(),
      payload: {
        sessions: sessions.map(toSessionListEntry),
      },
    });
  }

  private async handleDeleteSession(
    command: Extract<SessionCommand, { type: "session_delete" }>,
    connectionId: string,
  ): Promise<void> {
    const targetSessionId = command.payload.targetSessionId;
    const existing = await this.persistence.getSession(targetSessionId);
    if (!existing) {
      this.publisher.publishToConnection(connectionId, {
        type: "session_deleted",
        eventId: this.makeEventId(),
        commandId: command.commandId,
        timestamp: this.now(),
        payload: {
          targetSessionId,
          status: "not_found",
        },
      });
      return;
    }

    if (this.orchestrator.isSessionRunning?.(targetSessionId)) {
      await this.orchestrator.interruptAndWait?.(targetSessionId, (event) => {
        this.publisher.publish(event);
      });
    }

    await this.persistence.deleteSession(targetSessionId);
    this.onSessionDeleted?.(targetSessionId);
    this.publisher.publishToConnection(connectionId, {
      type: "session_deleted",
      eventId: this.makeEventId(),
      commandId: command.commandId,
      timestamp: this.now(),
      payload: {
        targetSessionId,
        status: "deleted",
      },
    });
  }

  private makeEventId(): string {
    return `event-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function toSessionListEntry(summary: SessionSummary) {
  return {
    id: summary.id,
    title: summary.title,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    messageCount: summary.messageCount,
    workspaceId: summary.workspaceId,
  };
}
