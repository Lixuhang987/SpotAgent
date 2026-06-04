import { randomUUID } from "node:crypto";
import type {
  WorkspaceAskCandidate,
} from "@handagent/core/protocol/SessionProtocolShared.ts";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type {
  WorkspaceAskResolver,
  WorkspaceAskUserResult,
} from "@handagent/core/tools/builtins/WorkspaceAskUserTool.ts";
import type { SessionBindingToken } from "./SessionPermissionBridge.ts";

type Send = (message: Extract<ServerRequest, { type: "workspace_ask" }>) => void;

type PendingJob = {
  requestId: string;
  sessionId: string;
  token: SessionBindingToken;
  send: Send;
  toolCallId?: string;
  prompt: string;
  candidates: WorkspaceAskCandidate[];
  resolve: (result: WorkspaceAskUserResult) => void;
  timeout?: ReturnType<typeof setTimeout>;
};

export type SessionWorkspaceAskBridgeOptions = {
  defaultTimeoutMs?: number;
};

export class SessionWorkspaceAskBridge {
  private readonly sessions = new Map<string, { token: SessionBindingToken; send: Send }>();
  private readonly active = new Map<string, PendingJob>();
  private readonly queues = new Map<string, PendingJob[]>();
  private readonly defaultTimeoutMs: number;
  private nextBindingToken = 0;

  constructor(options: SessionWorkspaceAskBridgeOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 60_000;
  }

  bindSession(sessionId: string, send: Send): SessionBindingToken {
    const token = ++this.nextBindingToken;
    this.sessions.set(sessionId, { token, send });
    return token;
  }

  unbindSession(sessionId: string, token?: SessionBindingToken): boolean {
    const binding = this.sessions.get(sessionId);
    if (!binding) {
      if (token !== undefined) {
        this.cancelPendingForToken(sessionId, token);
      }
      return false;
    }
    if (token !== undefined && binding.token !== token) {
      this.cancelPendingForToken(sessionId, token);
      return false;
    }

    this.sessions.delete(sessionId);
    this.cancelPendingForToken(sessionId, binding.token);
    return true;
  }

  ask: WorkspaceAskResolver = async (request) => {
    const sessionId = request.sessionId;
    if (!sessionId) {
      return { cancelled: true };
    }
    const binding = this.sessions.get(sessionId);
    if (!binding) {
      return { cancelled: true };
    }

    const requestId = `${sessionId}:${randomUUID()}`;
    return new Promise((resolve) => {
      const job: PendingJob = {
        requestId,
        sessionId,
        token: binding.token,
        send: binding.send,
        toolCallId: request.toolCallId,
        prompt: request.prompt,
        candidates: request.candidates,
        resolve,
      };
      const queue = this.queues.get(sessionId) ?? [];
      queue.push(job);
      this.queues.set(sessionId, queue);
      this.dispatchNext(sessionId);
    });
  };

  handleResponse(
    response: Extract<ClientResponse, { type: "workspace_answer" }>,
    token?: SessionBindingToken,
  ): void {
    const sessionId = sessionIdFromRequestId(response.requestId);
    const pending = this.active.get(sessionId);
    if (!pending || pending.requestId !== response.requestId) return;
    if (token !== undefined && pending.token !== token) return;
    const binding = this.sessions.get(sessionId);
    if (!binding || binding.token !== pending.token) return;

    this.resolveJob(
      pending,
      response.payload.cancelled || !response.payload.workspaceId
        ? { cancelled: true }
        : { workspaceId: response.payload.workspaceId },
    );
  }

  private dispatchNext(sessionId: string): void {
    if (this.active.has(sessionId)) return;
    const queue = this.queues.get(sessionId) ?? [];
    const next = queue.shift();
    if (!next) return;
    if (queue.length === 0) {
      this.queues.delete(sessionId);
    } else {
      this.queues.set(sessionId, queue);
    }

    const binding = this.sessions.get(sessionId);
    if (!binding || binding.token !== next.token) {
      next.resolve({ cancelled: true });
      this.dispatchNext(sessionId);
      return;
    }

    this.active.set(sessionId, next);
    next.timeout = setTimeout(() => {
      this.resolveJob(next, { cancelled: true });
    }, this.defaultTimeoutMs);

    next.send({
      type: "workspace_ask",
      requestId: next.requestId,
      sessionId,
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
    this.active.delete(job.sessionId);
    job.resolve(result);
    this.dispatchNext(job.sessionId);
  }

  private cancelPendingForToken(sessionId: string, token: SessionBindingToken): void {
    const active = this.active.get(sessionId);
    if (active?.token === token) {
      this.resolveJob(active, { cancelled: true });
    }

    const queue = this.queues.get(sessionId) ?? [];
    const remaining: PendingJob[] = [];
    for (const job of queue) {
      if (job.token === token) {
        job.resolve({ cancelled: true });
      } else {
        remaining.push(job);
      }
    }
    if (remaining.length === 0) {
      this.queues.delete(sessionId);
    } else {
      this.queues.set(sessionId, remaining);
    }
  }
}

function sessionIdFromRequestId(requestId: string): string {
  const separator = requestId.lastIndexOf(":");
  return separator === -1 ? requestId : requestId.slice(0, separator);
}
