import type { ThreadCommand } from "@handagent/core/protocol/ThreadCommand.ts";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";
import type {
  ThreadActionBinding,
  ThreadSummary,
} from "@handagent/core/storage/index.ts";
import type { WorkspaceRegistry } from "@handagent/core/workspace/Workspace.ts";
import type { Agent, AgentManager } from "../agent/AgentManager.ts";
import { threadIdFromRequestId } from "../agent/AgentRequestBroker.ts";
import { ThreadNotificationPublisher } from "./ThreadNotificationPublisher.ts";
import type { ThreadPersistence } from "./ThreadPersistence.ts";

type CreateThreadActionBinding = {
  pluginId: string;
  promptName: string;
};

type ActionBindingResolver = {
  resolve(binding: CreateThreadActionBinding): Promise<ThreadActionBinding>;
};

type AgentFactory = (threadId: string) => Agent;

type ResponseHandlers = {
  onPermissionResponse?: (
    response: Extract<ClientResponse, { type: "permission.answered" }>,
    connectionId: string,
  ) => void;
  onWorkspaceResponse?: (
    response: Extract<ClientResponse, { type: "workspace.answered" }>,
    connectionId: string,
  ) => void;
};

export class ThreadCommandRouter {
  constructor(
    private readonly agentManager: AgentManager,
    private readonly persistence: ThreadPersistence,
    private readonly publisher: ThreadNotificationPublisher,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly actionBindingResolver?: ActionBindingResolver,
    private readonly onThreadDeleted?: (threadId: string) => void,
    private readonly responseHandlers: ResponseHandlers = {},
    private readonly workspaceRegistry?: WorkspaceRegistry,
    private readonly createAgent?: AgentFactory,
  ) {}

  async receive(command: ThreadCommand, connectionId: string): Promise<void> {
    switch (command.type) {
      case "thread.start":
        return this.handleCreateThread(command, connectionId);
      case "thread.resume":
        return this.handleResumeThread(command, connectionId);
      case "op.submit":
        return this.handleOpSubmit(command, connectionId);
      case "thread.list":
        return this.handleListThreads(command, connectionId);
      case "thread.delete":
        return this.handleDeleteThread(command, connectionId);
      case "workspace.list":
        return this.handleListWorkspaces(command, connectionId);
    }
  }

  async handleResponse(response: ClientResponse, connectionId: string): Promise<void> {
    void connectionId;
    const threadId = threadIdFromRequestId(response.requestId);
    await this.agentManager.submit(threadId, {
      type: "client_response",
      opId: response.requestId,
      timestamp: response.timestamp,
      payload: { response },
    });
  }

  async interruptThread(threadId: string): Promise<void> {
    await this.agentManager.interrupt(threadId);
  }

  private async handleCreateThread(
    command: Extract<ThreadCommand, { type: "thread.start" }>,
    connectionId: string,
  ): Promise<void> {
    let actionBinding: ThreadActionBinding | undefined;
    if (command.payload.actionBinding) {
      actionBinding = await this.actionBindingResolver?.resolve(
        command.payload.actionBinding,
      );
      if (!actionBinding) {
        this.publisher.publishToConnection(connectionId, {
          type: "thread.error",
          notificationId: this.makeNotificationId(),
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

    const thread = await this.persistence.createThread(
      undefined,
      actionBinding,
      command.payload.workspaceId,
    );
    const threadId = thread.metadata.id;
    this.ensureAgent(threadId);
    this.publisher.subscribe(connectionId, threadId);
    this.publisher.publishToConnection(connectionId, {
      type: "thread.started",
      threadId,
      notificationId: this.makeNotificationId(),
      commandId: command.commandId,
      timestamp: this.now(),
      payload: { preview: thread.metadata.preview ?? null },
    });
  }

  private async handleResumeThread(
    command: Extract<ThreadCommand, { type: "thread.resume" }>,
    connectionId: string,
  ): Promise<void> {
    this.publisher.subscribe(connectionId, command.threadId);
    const thread = await this.persistence.getThread(command.threadId);
    if (!thread) {
      this.publisher.publishToConnection(connectionId, {
        type: "thread.error",
        threadId: command.threadId,
        notificationId: this.makeNotificationId(),
        commandId: command.commandId,
        timestamp: this.now(),
        payload: {
          code: "not_found",
          message: `Thread not found: ${command.threadId}`,
        },
      });
      return;
    }

    this.ensureAgent(command.threadId);
    const isRunning = this.agentManager.isRunning(command.threadId);
    const recoveredStatus = !isRunning
      ? await this.persistence.recoverIncompleteTurnForSnapshot(command.threadId, this.now())
      : null;
    const messages = await this.persistence.getConversationMessages(command.threadId);

    this.publisher.publishToConnection(connectionId, {
      type: "thread.snapshot",
      threadId: command.threadId,
      notificationId: this.makeNotificationId(),
      commandId: command.commandId,
      timestamp: this.now(),
      payload: {
        messages,
        status: isRunning ? "running" : (recoveredStatus ?? "idle"),
      },
    });
  }

  private async handleOpSubmit(
    command: Extract<ThreadCommand, { type: "op.submit" }>,
    connectionId?: string,
  ): Promise<void> {
    if (!(await this.persistence.getThread(command.threadId))) {
      const errorEvent: ThreadNotification = {
        type: "thread.error",
        threadId: command.threadId,
        notificationId: this.makeNotificationId(),
        timestamp: this.now(),
        payload: {
          code: "thread_not_found",
          message: `Thread not found: ${command.threadId}`,
        },
      };
      if (connectionId) {
        this.publisher.publishToConnection(connectionId, errorEvent);
      } else {
        this.publisher.publish(errorEvent);
      }
      return;
    }

    const op = command.payload.op;
    this.ensureAgent(command.threadId);
    await this.agentManager.submit(command.threadId, op);
  }

  private async handleListThreads(
    command: Extract<ThreadCommand, { type: "thread.list" }>,
    connectionId: string,
  ): Promise<void> {
    const threads = await this.persistence.listThreads();
    this.publisher.publishToConnection(connectionId, {
      type: "thread.listed",
      notificationId: this.makeNotificationId(),
      commandId: command.commandId,
      timestamp: this.now(),
      payload: {
        threads: threads.map(toThreadListEntry),
      },
    });
  }

  private async handleDeleteThread(
    command: Extract<ThreadCommand, { type: "thread.delete" }>,
    connectionId: string,
  ): Promise<void> {
    const targetThreadId = command.payload.targetThreadId;
    const existing = await this.persistence.getThread(targetThreadId);
    if (!existing) {
      this.publisher.publishToConnection(connectionId, {
        type: "thread.deleted",
        notificationId: this.makeNotificationId(),
        commandId: command.commandId,
        timestamp: this.now(),
        payload: {
          targetThreadId,
          status: "not_found",
        },
      });
      return;
    }

    await this.agentManager.delete(targetThreadId);

    await this.persistence.deleteThread(targetThreadId);
    this.onThreadDeleted?.(targetThreadId);
    this.publisher.publishToConnection(connectionId, {
      type: "thread.deleted",
      notificationId: this.makeNotificationId(),
      commandId: command.commandId,
      timestamp: this.now(),
      payload: {
        targetThreadId,
        status: "deleted",
      },
    });
  }

  private async handleListWorkspaces(
    command: Extract<ThreadCommand, { type: "workspace.list" }>,
    connectionId: string,
  ): Promise<void> {
    if (!this.workspaceRegistry) {
      this.publisher.publishToConnection(connectionId, {
        type: "thread.error",
        notificationId: this.makeNotificationId(),
        commandId: command.commandId,
        timestamp: this.now(),
        payload: {
          code: "workspace_registry_not_configured",
          message: "Workspace registry is not configured",
        },
      });
      return;
    }

    const workspaces = await this.workspaceRegistry.list();
    this.publisher.publishToConnection(connectionId, {
      type: "workspace.listed",
      notificationId: this.makeNotificationId(),
      commandId: command.commandId,
      timestamp: this.now(),
      payload: {
        workspaces: workspaces.map((ws) => ({
          id: ws.id,
          name: ws.name,
          rootPath: ws.rootPath,
        })),
      },
    });
  }

  private makeNotificationId(): string {
    return `notification-${Math.random().toString(36).slice(2, 10)}`;
  }

  private ensureAgent(threadId: string): void {
    if (this.agentManager.has(threadId) || !this.createAgent) {
      return;
    }

    this.agentManager.register(threadId, this.createAgent(threadId));
  }
}

function toThreadListEntry(summary: ThreadSummary) {
  return {
    id: summary.id,
    preview: summary.preview,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    messageCount: summary.messageCount,
    workspaceId: summary.workspaceId,
  };
}
