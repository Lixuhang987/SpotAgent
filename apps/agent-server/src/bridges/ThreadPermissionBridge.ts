import { randomUUID } from "node:crypto";
import type { AskResolver } from "@handagent/core/permission/FilePermissionPolicy.ts";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";

type Send = (message: Extract<ServerRequest, { type: "permission.requested" }>) => void;
export type ThreadBindingToken = number;

type Pending = {
  threadId: string;
  token: ThreadBindingToken;
  resolve: (resolution: {
    decision: "allow" | "deny";
    remember?: "once" | "thread" | "always";
    reason?: string;
  }) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type ThreadPermissionBridgeOptions = {
  defaultTimeoutMs?: number;
};

export class ThreadPermissionBridge {
  private readonly threads = new Map<string, { token: ThreadBindingToken; send: Send }>();
  private readonly pending = new Map<string, Pending>();
  private readonly defaultTimeoutMs: number;
  private nextBindingToken = 0;

  constructor(options: ThreadPermissionBridgeOptions = {}) {
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
        this.failPendingForToken(threadId, token);
      }
      return false;
    }
    if (token !== undefined && binding.token !== token) {
      this.failPendingForToken(threadId, token);
      return false;
    }

    this.threads.delete(threadId);
    this.failPendingForToken(threadId, binding.token);
    return true;
  }

  ask: AskResolver = async (request) => {
    const threadId = threadIdFromCoreRequest(request);
    if (!threadId) {
      return { decision: "deny", reason: "no thread id" };
    }
    const binding = this.threads.get(threadId);
    if (!binding) {
      return { decision: "deny", reason: "no active socket" };
    }

    const requestId = `${threadId}:${randomUUID()}`;
    const timeoutMs = this.defaultTimeoutMs;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ decision: "deny", reason: "permission request timed out" });
      }, timeoutMs);

      this.pending.set(requestId, {
        threadId,
        token: binding.token,
        resolve,
        timeout,
      });

      binding.send({
        type: "permission.requested",
        requestId,
        threadId,
        timestamp: new Date().toISOString(),
        payload: {
          toolName: request.toolName,
          toolCallId: request.toolCallId,
          arguments: request.arguments,
          timeoutMs,
        },
      });
    });
  };

  handleResponse(
    response: Extract<ClientResponse, { type: "permission.answered" }>,
    token?: ThreadBindingToken,
  ): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    if (token !== undefined && pending.token !== token) return;
    const binding = this.threads.get(pending.threadId);
    if (!binding || binding.token !== pending.token) return;

    clearTimeout(pending.timeout);
    this.pending.delete(response.requestId);
    pending.resolve({
      decision: response.payload.decision,
      ...(response.payload.scope ? { remember: response.payload.scope } : {}),
      ...(response.payload.reason ? { reason: response.payload.reason } : {}),
    });
  }

  private failPendingForToken(threadId: string, token: ThreadBindingToken): void {
    for (const [requestId, pending] of this.pending) {
      if (pending.threadId !== threadId || pending.token !== token) continue;
      clearTimeout(pending.timeout);
      pending.resolve({ decision: "deny", reason: "thread closed" });
      this.pending.delete(requestId);
    }
  }
}

function threadIdFromCoreRequest(request: Parameters<AskResolver>[0]): string | undefined {
  return request.threadId;
}
