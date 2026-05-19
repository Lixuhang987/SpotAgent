import { randomUUID } from "node:crypto";
import type {
  PlatformBridge,
  PlatformBridgeMethod,
} from "@handagent/core/platform/PlatformBridge.ts";
import {
  PlatformBridgeOfflineError,
  PlatformBridgeRemoteError,
  PlatformBridgeTimeoutError,
} from "@handagent/core/platform/PlatformBridge.ts";
import type {
  PlatformResponsePayload,
  SessionMessage,
} from "@handagent/core/protocol/SessionMessage.ts";

type Pending = {
  method: string;
  token: BridgeToken;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type Send = (message: SessionMessage) => void;
export type BridgeToken = number;

export class WebSocketPlatformBridge implements PlatformBridge {
  private send: Send | null = null;
  private currentToken: BridgeToken | null = null;
  private nextToken = 0;
  private readonly pending = new Map<string, Pending>();

  attach(send: Send): BridgeToken {
    const previousToken = this.currentToken;
    if (previousToken !== null) {
      this.failPendingForToken(previousToken, "desktop bridge replaced");
    }

    const token = ++this.nextToken;
    this.send = send;
    this.currentToken = token;
    return token;
  }

  detach(token?: BridgeToken, reason = "desktop disconnected"): void {
    const tokenToDetach = token ?? this.currentToken;
    if (tokenToDetach === null || tokenToDetach !== this.currentToken) {
      return;
    }

    this.send = null;
    this.currentToken = null;
    this.failPendingForToken(tokenToDetach, reason);
  }

  isAvailable(): boolean {
    return this.send !== null;
  }

  call<T>(method: PlatformBridgeMethod, args: unknown, timeoutMs = 15_000): Promise<T> {
    const send = this.send;
    const token = this.currentToken;
    if (!send || token === null) {
      return Promise.reject(new PlatformBridgeOfflineError(method));
    }

    const requestId = randomUUID();

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new PlatformBridgeTimeoutError(method, timeoutMs));
      }, timeoutMs);

      this.pending.set(requestId, {
        method,
        token,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      send({
        type: "platform_request",
        sessionId: "_platform",
        messageId: requestId,
        timestamp: new Date().toISOString(),
        payload: { requestId, method, args, timeoutMs },
      });
    });
  }

  handleResponse(payload: PlatformResponsePayload, token = this.currentToken): void {
    const pending = this.pending.get(payload.requestId);
    if (!pending) return;
    if (pending.token !== token) return;

    clearTimeout(pending.timeout);
    this.pending.delete(payload.requestId);

    if (payload.status === "ok") {
      pending.resolve(payload.result);
    } else {
      pending.reject(new PlatformBridgeRemoteError(payload.message, payload.code));
    }
  }

  private failPendingForToken(token: BridgeToken, reason: string): void {
    for (const [requestId, pending] of this.pending) {
      if (pending.token !== token) continue;
      clearTimeout(pending.timeout);
      pending.reject(new PlatformBridgeOfflineError(`${pending.method} (${reason})`));
      this.pending.delete(requestId);
    }
  }
}
