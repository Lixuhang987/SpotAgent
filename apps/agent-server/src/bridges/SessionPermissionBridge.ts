import { randomUUID } from "node:crypto";
import type { AskResolver } from "@handagent/core/permission/FilePermissionPolicy.ts";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";

type Send = (message: Extract<ServerRequest, { type: "permission_ask" }>) => void;
export type SessionBindingToken = number;

type Pending = {
  sessionId: string;
  token: SessionBindingToken;
  resolve: (resolution: {
    decision: "allow" | "deny";
    remember?: "once" | "session" | "always";
    reason?: string;
  }) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type SessionPermissionBridgeOptions = {
  defaultTimeoutMs?: number;
};

export class SessionPermissionBridge {
  private readonly sessions = new Map<string, { token: SessionBindingToken; send: Send }>();
  private readonly pending = new Map<string, Pending>();
  private readonly defaultTimeoutMs: number;
  private nextBindingToken = 0;

  constructor(options: SessionPermissionBridgeOptions = {}) {
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
        this.failPendingForToken(sessionId, token);
      }
      return false;
    }
    if (token !== undefined && binding.token !== token) {
      this.failPendingForToken(sessionId, token);
      return false;
    }

    this.sessions.delete(sessionId);
    this.failPendingForToken(sessionId, binding.token);
    return true;
  }

  ask: AskResolver = async (request) => {
    const sessionId = request.sessionId;
    if (!sessionId) {
      return { decision: "deny", reason: "no session id" };
    }
    const binding = this.sessions.get(sessionId);
    if (!binding) {
      return { decision: "deny", reason: "no active socket" };
    }

    const requestId = `${sessionId}:${randomUUID()}`;
    const timeoutMs = this.defaultTimeoutMs;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ decision: "deny", reason: "permission request timed out" });
      }, timeoutMs);

      this.pending.set(requestId, {
        sessionId,
        token: binding.token,
        resolve,
        timeout,
      });

      binding.send({
        type: "permission_ask",
        requestId,
        sessionId,
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
    response: Extract<ClientResponse, { type: "permission_answer" }>,
    token?: SessionBindingToken,
  ): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    if (token !== undefined && pending.token !== token) return;
    const binding = this.sessions.get(pending.sessionId);
    if (!binding || binding.token !== pending.token) return;

    clearTimeout(pending.timeout);
    this.pending.delete(response.requestId);
    pending.resolve({
      decision: response.payload.decision,
      remember: response.payload.scope,
      reason: response.payload.reason,
    });
  }

  private failPendingForToken(sessionId: string, token: SessionBindingToken): void {
    for (const [requestId, pending] of this.pending) {
      if (pending.sessionId !== sessionId || pending.token !== token) continue;
      clearTimeout(pending.timeout);
      pending.resolve({ decision: "deny", reason: "session closed" });
      this.pending.delete(requestId);
    }
  }
}
