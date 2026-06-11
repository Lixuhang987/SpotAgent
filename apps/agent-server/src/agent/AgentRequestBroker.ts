import { randomUUID } from "node:crypto";
import type { AskResolver } from "@handagent/core/permission/FilePermissionPolicy.ts";
import type { AgentServerRequestEvent } from "@handagent/core/protocol/AgentEvent.ts";
import type { ClientResponseOp } from "@handagent/core/protocol/Op.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type { WorkspaceAskCandidate } from "@handagent/core/protocol/ThreadProtocolShared.ts";
import type {
  WorkspaceAskResolver,
  WorkspaceAskUserResult,
} from "@handagent/core/tools/builtins/WorkspaceAskUserTool.ts";

type EmitRequest = (event: AgentServerRequestEvent) => void;

type PermissionPending = {
  threadId: string;
  resolve: (resolution: {
    decision: "allow" | "deny";
    remember?: "once" | "thread" | "always";
    reason?: string;
  }) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type WorkspacePending = {
  requestId: string;
  threadId: string;
  toolCallId?: string;
  prompt: string;
  candidates: WorkspaceAskCandidate[];
  resolve: (result: WorkspaceAskUserResult) => void;
  timeout?: ReturnType<typeof setTimeout>;
};

export type AgentRequestBrokerOptions = {
  defaultTimeoutMs?: number;
  now?: () => string;
};

export class AgentRequestBroker {
  private readonly emitters = new Map<string, EmitRequest>();
  private readonly permissionPending = new Map<string, PermissionPending>();
  private readonly workspaceActive = new Map<string, WorkspacePending>();
  private readonly workspaceQueues = new Map<string, WorkspacePending[]>();
  private readonly defaultTimeoutMs: number;
  private readonly now: () => string;

  constructor(options: AgentRequestBrokerOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 60_000;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  bindThread(threadId: string, emit: EmitRequest): void {
    this.emitters.set(threadId, emit);
  }

  unbindThread(threadId: string): void {
    this.emitters.delete(threadId);

    for (const [requestId, pending] of this.permissionPending) {
      if (pending.threadId !== threadId) continue;
      clearTimeout(pending.timeout);
      pending.resolve({ decision: "deny", reason: "thread closed" });
      this.permissionPending.delete(requestId);
    }

    const active = this.workspaceActive.get(threadId);
    if (active) {
      this.resolveWorkspace(active, { cancelled: true });
    }

    const queued = this.workspaceQueues.get(threadId) ?? [];
    this.workspaceQueues.delete(threadId);
    for (const job of queued) {
      job.resolve({ cancelled: true });
    }
  }

  askPermission: AskResolver = async (request) => {
    const threadId = request.threadId;
    if (!threadId) {
      return { decision: "deny", reason: "no thread id" };
    }

    const emit = this.emitters.get(threadId);
    if (!emit) {
      return { decision: "deny", reason: "no active agent" };
    }

    const requestId = `${threadId}:${randomUUID()}`;
    const timeoutMs = this.defaultTimeoutMs;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.permissionPending.delete(requestId);
        resolve({ decision: "deny", reason: "permission request timed out" });
      }, timeoutMs);

      const requestMessage: Extract<ServerRequest, { type: "permission.requested" }> = {
        type: "permission.requested",
        requestId,
        threadId,
        timestamp: this.now(),
        payload: {
          toolName: request.toolName,
          toolCallId: request.toolCallId,
          arguments: request.arguments,
          timeoutMs,
        },
      };

      this.permissionPending.set(requestId, { threadId, resolve, timeout });
      emit(this.wrapRequest(threadId, requestMessage));
    });
  };

  askWorkspace: WorkspaceAskResolver = async (request) => {
    const threadId = request.threadId;
    if (!threadId || !this.emitters.has(threadId)) {
      return { cancelled: true };
    }

    const requestId = `${threadId}:${randomUUID()}`;
    return new Promise((resolve) => {
      const job: WorkspacePending = {
        requestId,
        threadId,
        toolCallId: request.toolCallId,
        prompt: request.prompt,
        candidates: request.candidates,
        resolve,
      };
      const queue = this.workspaceQueues.get(threadId) ?? [];
      queue.push(job);
      this.workspaceQueues.set(threadId, queue);
      this.dispatchWorkspace(threadId);
    });
  };

  handleOp(op: ClientResponseOp): void {
    const response = op.payload.response;
    switch (response.type) {
      case "permission.answered":
        this.handlePermissionResponse(response);
        return;
      case "workspace.answered":
        this.handleWorkspaceResponse(response);
        return;
    }
  }

  cancelPendingForThread(threadId: string): void {
    for (const [requestId, pending] of this.permissionPending) {
      if (pending.threadId !== threadId) continue;
      clearTimeout(pending.timeout);
      pending.resolve({ decision: "deny", reason: "thread interrupted" });
      this.permissionPending.delete(requestId);
    }

    const active = this.workspaceActive.get(threadId);
    if (active) {
      this.resolveWorkspace(active, { cancelled: true });
    }

    const queued = this.workspaceQueues.get(threadId) ?? [];
    this.workspaceQueues.delete(threadId);
    for (const job of queued) {
      job.resolve({ cancelled: true });
    }
  }

  private handlePermissionResponse(
    response: Extract<ServerRequestResponse, { type: "permission.answered" }>,
  ): void {
    const pending = this.permissionPending.get(response.requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.permissionPending.delete(response.requestId);
    pending.resolve({
      decision: response.payload.decision,
      ...(response.payload.scope ? { remember: response.payload.scope } : {}),
      ...(response.payload.reason ? { reason: response.payload.reason } : {}),
    });
  }

  private handleWorkspaceResponse(
    response: Extract<ServerRequestResponse, { type: "workspace.answered" }>,
  ): void {
    const threadId = threadIdFromRequestId(response.requestId);
    const active = this.workspaceActive.get(threadId);
    if (!active || active.requestId !== response.requestId) return;

    this.resolveWorkspace(
      active,
      response.payload.cancelled || !response.payload.workspaceId
        ? { cancelled: true }
        : { workspaceId: response.payload.workspaceId },
    );
  }

  private dispatchWorkspace(threadId: string): void {
    if (this.workspaceActive.has(threadId)) return;

    const queue = this.workspaceQueues.get(threadId) ?? [];
    const next = queue.shift();
    if (!next) return;

    if (queue.length === 0) {
      this.workspaceQueues.delete(threadId);
    } else {
      this.workspaceQueues.set(threadId, queue);
    }

    const emit = this.emitters.get(threadId);
    if (!emit) {
      next.resolve({ cancelled: true });
      this.dispatchWorkspace(threadId);
      return;
    }

    const timeoutMs = this.defaultTimeoutMs;
    next.timeout = setTimeout(() => {
      this.resolveWorkspace(next, { cancelled: true });
    }, timeoutMs);
    this.workspaceActive.set(threadId, next);

    emit(this.wrapRequest(threadId, {
      type: "workspace.requested",
      requestId: next.requestId,
      threadId,
      timestamp: this.now(),
      payload: {
        toolCallId: next.toolCallId,
        prompt: next.prompt,
        candidates: next.candidates,
        timeoutMs,
      },
    }));
  }

  private resolveWorkspace(job: WorkspacePending, result: WorkspaceAskUserResult): void {
    if (job.timeout) {
      clearTimeout(job.timeout);
    }
    this.workspaceActive.delete(job.threadId);
    job.resolve(result);
    this.dispatchWorkspace(job.threadId);
  }

  private wrapRequest(threadId: string, request: ServerRequest): AgentServerRequestEvent {
    return {
      type: "server.request",
      eventId: `agent-event-${randomUUID()}`,
      threadId,
      timestamp: request.timestamp,
      payload: request,
    };
  }
}

type ServerRequestResponse = ClientResponseOp["payload"]["response"];

export function threadIdFromRequestId(requestId: string): string {
  const separator = requestId.lastIndexOf(":");
  return separator === -1 ? requestId : requestId.slice(0, separator);
}
