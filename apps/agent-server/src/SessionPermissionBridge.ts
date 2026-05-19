import { randomUUID } from "node:crypto";
import type { AskResolver } from "@handagent/core/permission/FilePermissionPolicy.ts";
import type { SessionMessage } from "@handagent/core/protocol/SessionMessage.ts";

type Send = (message: SessionMessage) => void;
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
        type: "permission_request",
        sessionId,
        messageId: requestId,
        timestamp: new Date().toISOString(),
        payload: {
          requestId,
          toolName: request.toolName,
          toolCallId: request.toolCallId,
          arguments: request.arguments,
          timeoutMs,
        },
      });
    });
  };

  handleResponse(payload: {
    requestId: string;
    decision: "allow" | "deny";
    scope?: "once" | "session" | "always";
    reason?: string;
  }, token?: SessionBindingToken): void {
    const pending = this.pending.get(payload.requestId);
    if (!pending) return;
    if (token !== undefined && pending.token !== token) return;
    const binding = this.sessions.get(pending.sessionId);
    if (!binding || binding.token !== pending.token) return;

    clearTimeout(pending.timeout);
    this.pending.delete(payload.requestId);
    pending.resolve({
      decision: payload.decision,
      remember: payload.scope,
      reason: payload.reason,
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
