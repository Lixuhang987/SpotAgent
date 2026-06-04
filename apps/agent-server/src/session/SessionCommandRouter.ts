import type { SessionCommand } from "@handagent/core/protocol/SessionCommand.ts";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { SessionEvent } from "@handagent/core/protocol/SessionEvent.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type { SessionMessage } from "@handagent/core/protocol/SessionMessage.ts";
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
        this.orchestrator.interruptSession?.(
          command.sessionId,
          this.createLegacyPush(command.sessionId, connectionId),
        );
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
    const session = await this.persistence.getSession(command.sessionId);
    if (!session) {
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

    const state = {
      interrupted: false,
      failed: false,
      toolRunning: new Set<string>(),
    };
    const push = this.createLegacyPush(command.sessionId, connectionId, state, command.commandId);
    await this.orchestrator.handleUserMessage(
      {
        type: "user_message",
        sessionId: command.sessionId,
        messageId: command.commandId,
        timestamp: command.timestamp,
        payload: {
          text: command.payload.text,
          attachments: command.payload.attachments,
        },
      },
      push,
    );

    if (state.interrupted) {
      return;
    }

    const completionStatus: Extract<
      SessionEvent,
      { type: "turn_completed" }
    >["payload"]["status"] = state.failed ? "failed" : "completed";
    const sessionStatus: Extract<
      SessionEvent,
      { type: "session_status_changed" }
    >["payload"]["value"] = state.failed ? "failed" : "idle";

    this.publisher.publish({
      type: "turn_completed",
      sessionId: command.sessionId,
      eventId: this.makeEventId(),
      turnId: command.commandId,
      timestamp: this.now(),
      payload: {
        status: completionStatus,
      },
    });
    this.publisher.publish({
      type: "session_status_changed",
      sessionId: command.sessionId,
      eventId: this.makeEventId(),
      timestamp: this.now(),
      payload: {
        value: sessionStatus,
      },
    });
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
      await this.orchestrator.interruptAndWait?.(
        targetSessionId,
        this.createLegacyPush(targetSessionId, connectionId, undefined, command.commandId),
      );
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

  private createLegacyPush(
    sessionId: string,
    connectionId?: string,
    state: {
      interrupted: boolean;
      failed: boolean;
      toolRunning: Set<string>;
    } = { interrupted: false, failed: false, toolRunning: new Set<string>() },
    turnId = "legacy-turn",
  ): (message: SessionMessage) => void {
    return (message) => {
      const published = legacyMessageToPublished(message, turnId, this.makeEventId(), this.now());
      if (message.type === "assistant_message_end" && message.payload.status === "interrupted") {
        state.interrupted = true;
      }
      if (message.type === "status" && message.payload.value === "interrupted") {
        state.interrupted = true;
      }
      if (message.type === "error") {
        state.failed = true;
      }
      if (published) {
        if (
          (published.type === "session_error" || published.type === "session_created" || published.type === "sessions_listed" || published.type === "session_deleted") &&
          connectionId
        ) {
          this.publisher.publishToConnection(connectionId, published);
        } else {
          this.publisher.publish(published);
        }
      }
      void sessionId;
    };
  }

  private makeEventId(): string {
    return `event-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function legacyMessageToPublished(
  message: SessionMessage,
  turnId: string,
  eventId: string,
  timestamp: string,
): SessionEvent | ServerRequest | null {
  switch (message.type) {
    case "session_snapshot":
      return {
        type: "session_snapshot",
        sessionId: message.sessionId,
        eventId,
        timestamp,
        payload: message.payload,
      };
    case "assistant_message_delta":
      return {
        type: "assistant_delta",
        sessionId: message.sessionId,
        eventId,
        turnId,
        itemId: message.messageId,
        timestamp,
        payload: { text: message.payload.text },
      };
    case "tool_message":
      if (message.payload.status === "running") {
        return {
          type: "tool_started",
          sessionId: message.sessionId,
          eventId,
          turnId,
          itemId: message.messageId,
          timestamp,
          payload: {
            name: message.payload.name,
            input: tryParseObject(message.payload.text),
          },
        };
      }
      return {
        type: "tool_finished",
        sessionId: message.sessionId,
        eventId,
        turnId,
        itemId: message.messageId,
        timestamp,
        payload: {
          name: message.payload.name,
          status: message.payload.status,
          output: message.payload.text,
          durationMs: 0,
        },
      };
    case "status":
      return {
        type: "session_status_changed",
        sessionId: message.sessionId,
        eventId,
        timestamp,
        payload: {
          value: message.payload.value,
        },
      };
    case "error":
      return {
        type: "session_error",
        sessionId: message.sessionId,
        eventId,
        timestamp,
        payload: {
          message: message.payload.message,
        },
      };
    case "permission_request":
      return {
        type: "permission_ask",
        requestId: message.payload.requestId,
        sessionId: message.sessionId,
        timestamp,
        payload: {
          toolName: message.payload.toolName,
          toolCallId: message.payload.toolCallId,
          arguments: message.payload.arguments,
          timeoutMs: message.payload.timeoutMs,
        },
      };
    case "workspace_ask_request":
      return {
        type: "workspace_ask",
        requestId: message.payload.requestId,
        sessionId: message.sessionId,
        timestamp,
        payload: {
          toolCallId: message.payload.toolCallId,
          prompt: message.payload.prompt,
          candidates: message.payload.candidates,
          timeoutMs: message.payload.timeoutMs,
        },
      };
    default:
      return null;
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

function tryParseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
