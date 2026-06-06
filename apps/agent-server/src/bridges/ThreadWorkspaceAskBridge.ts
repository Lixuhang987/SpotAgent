import { randomUUID } from "node:crypto";
import type {
  WorkspaceAskCandidate,
} from "@handagent/core/protocol/ThreadProtocolShared.ts";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type {
  WorkspaceAskResolver,
  WorkspaceAskUserResult,
} from "@handagent/core/tools/builtins/WorkspaceAskUserTool.ts";
import type { ThreadBindingToken } from "./ThreadPermissionBridge.ts";

type Send = (message: Extract<ServerRequest, { type: "workspace.requested" }>) => void;

type PendingJob = {
  requestId: string;
  threadId: string;
  token: ThreadBindingToken;
  send: Send;
  toolCallId?: string;
  prompt: string;
  candidates: WorkspaceAskCandidate[];
  resolve: (result: WorkspaceAskUserResult) => void;
  timeout?: ReturnType<typeof setTimeout>;
};

export type ThreadWorkspaceAskBridgeOptions = {
  defaultTimeoutMs?: number;
};

export class ThreadWorkspaceAskBridge {
  private readonly threads = new Map<string, { token: ThreadBindingToken; send: Send }>();
  private readonly active = new Map<string, PendingJob>();
  private readonly queues = new Map<string, PendingJob[]>();
  private readonly defaultTimeoutMs: number;
  private nextBindingToken = 0;

  constructor(options: ThreadWorkspaceAskBridgeOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 60_000;
  }

  bindThread(threadId: string, send: Send): ThreadBindingToken {
    const token = ++this.nextBindingToken;
    this.threads.set(threadId, { token, send });
    return token;
  }

  unbindThread(threadId: string, token?: ThreadBindingToken): boolean {
    const binding = this.threads.get(threadId);
    if (!binding) {
      if (token !== undefined) {
        this.cancelPendingForToken(threadId, token);
      }
      return false;
    }
    if (token !== undefined && binding.token !== token) {
      this.cancelPendingForToken(threadId, token);
      return false;
    }

    this.threads.delete(threadId);
    this.cancelPendingForToken(threadId, binding.token);
    return true;
  }

  ask: WorkspaceAskResolver = async (request) => {
    const threadId = threadIdFromCoreRequest(request);
    if (!threadId) {
      return { cancelled: true };
    }
    const binding = this.threads.get(threadId);
    if (!binding) {
      return { cancelled: true };
    }

    const requestId = `${threadId}:${randomUUID()}`;
    return new Promise((resolve) => {
      const job: PendingJob = {
        requestId,
        threadId,
        token: binding.token,
        send: binding.send,
        toolCallId: request.toolCallId,
        prompt: request.prompt,
        candidates: request.candidates,
        resolve,
      };
      const queue = this.queues.get(threadId) ?? [];
      queue.push(job);
      this.queues.set(threadId, queue);
      this.dispatchNext(threadId);
    });
  };

  handleResponse(
    response: Extract<ClientResponse, { type: "workspace.answered" }>,
    token?: ThreadBindingToken,
  ): void {
    const threadId = threadIdFromRequestId(response.requestId);
    const pending = this.active.get(threadId);
    if (!pending || pending.requestId !== response.requestId) return;
    if (token !== undefined && pending.token !== token) return;
    const binding = this.threads.get(threadId);
    if (!binding || binding.token !== pending.token) return;

    this.resolveJob(
      pending,
      response.payload.cancelled || !response.payload.workspaceId
        ? { cancelled: true }
        : { workspaceId: response.payload.workspaceId },
    );
  }

  private dispatchNext(threadId: string): void {
    if (this.active.has(threadId)) return;
    const queue = this.queues.get(threadId) ?? [];
    const next = queue.shift();
    if (!next) return;
    if (queue.length === 0) {
      this.queues.delete(threadId);
    } else {
      this.queues.set(threadId, queue);
    }

    const binding = this.threads.get(threadId);
    if (!binding || binding.token !== next.token) {
      next.resolve({ cancelled: true });
      this.dispatchNext(threadId);
      return;
    }

    this.active.set(threadId, next);
    next.timeout = setTimeout(() => {
      this.resolveJob(next, { cancelled: true });
    }, this.defaultTimeoutMs);

    next.send({
      type: "workspace.requested",
      requestId: next.requestId,
      threadId,
      timestamp: new Date().toISOString(),
      payload: {
        toolCallId: next.toolCallId,
        prompt: next.prompt,
        candidates: next.candidates,
        timeoutMs: this.defaultTimeoutMs,
      },
    });
  }

  private resolveJob(job: PendingJob, result: WorkspaceAskUserResult): void {
    if (job.timeout) {
      clearTimeout(job.timeout);
    }
    this.active.delete(job.threadId);
    job.resolve(result);
    this.dispatchNext(job.threadId);
  }

  private cancelPendingForToken(threadId: string, token: ThreadBindingToken): void {
    const active = this.active.get(threadId);
    if (active?.token === token) {
      this.resolveJob(active, { cancelled: true });
    }

    const queue = this.queues.get(threadId) ?? [];
    const remaining: PendingJob[] = [];
    for (const job of queue) {
      if (job.token === token) {
        job.resolve({ cancelled: true });
      } else {
        remaining.push(job);
      }
    }
    if (remaining.length === 0) {
      this.queues.delete(threadId);
    } else {
      this.queues.set(threadId, remaining);
    }
  }
}

function threadIdFromRequestId(requestId: string): string {
  const separator = requestId.lastIndexOf(":");
  return separator === -1 ? requestId : requestId.slice(0, separator);
}

function threadIdFromCoreRequest(
  request: Parameters<WorkspaceAskResolver>[0],
): string | undefined {
  return request.threadId;
}
