import { randomUUID } from "node:crypto";
import type { AskResolver } from "../../../packages/core/src/permission/FilePermissionPolicy.ts";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage.ts";

type Send = (message: SessionMessage) => void;

type Pending = {
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
  private readonly sessions = new Map<string, Send>();
  private readonly pending = new Map<string, Pending>();
  private readonly defaultTimeoutMs: number;

  constructor(options: SessionPermissionBridgeOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 60_000;
  }

  bindSession(sessionId: string, send: Send): void {
    this.sessions.set(sessionId, send);
  }

  unbindSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    for (const [requestId, pending] of this.pending) {
      if (requestId.startsWith(`${sessionId}:`)) {
        clearTimeout(pending.timeout);
        pending.resolve({ decision: "deny", reason: "session closed" });
        this.pending.delete(requestId);
      }
    }
  }

  ask: AskResolver = async (request) => {
    const sessionId = request.sessionId;
    if (!sessionId) {
      return { decision: "deny", reason: "no session id" };
    }
    const send = this.sessions.get(sessionId);
    if (!send) {
      return { decision: "deny", reason: "no active socket" };
    }

    const requestId = `${sessionId}:${randomUUID()}`;
    const timeoutMs = this.defaultTimeoutMs;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ decision: "deny", reason: "permission request timed out" });
      }, timeoutMs);

      this.pending.set(requestId, { resolve, timeout });

      send({
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
  }): void {
    const pending = this.pending.get(payload.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(payload.requestId);
    pending.resolve({
      decision: payload.decision,
      remember: payload.scope,
      reason: payload.reason,
    });
  }
}
