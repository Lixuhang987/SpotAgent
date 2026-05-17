import { randomUUID } from "node:crypto";
import type {
  PlatformBridge,
  PlatformBridgeMethod,
} from "../../../packages/core/src/platform/PlatformBridge.ts";
import {
  PlatformBridgeOfflineError,
  PlatformBridgeRemoteError,
  PlatformBridgeTimeoutError,
} from "../../../packages/core/src/platform/PlatformBridge.ts";
import type {
  PlatformResponsePayload,
  SessionMessage,
} from "../../../packages/core/src/protocol/SessionMessage.ts";

type Pending = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type Send = (message: SessionMessage) => void;

export class WebSocketPlatformBridge implements PlatformBridge {
  private send: Send | null = null;
  private readonly pending = new Map<string, Pending>();

  attach(send: Send): void {
    this.send = send;
  }

  detach(reason = "desktop disconnected"): void {
    this.send = null;
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new PlatformBridgeOfflineError(`${pending.method} (${reason})`));
    }
    this.pending.clear();
  }

  isAvailable(): boolean {
    return this.send !== null;
  }

  call<T>(method: PlatformBridgeMethod, args: unknown, timeoutMs = 15_000): Promise<T> {
    const send = this.send;
    if (!send) {
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

  handleResponse(payload: PlatformResponsePayload): void {
    const pending = this.pending.get(payload.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(payload.requestId);

    if (payload.status === "ok") {
      pending.resolve(payload.result);
    } else {
      pending.reject(new PlatformBridgeRemoteError(payload.message, payload.code));
    }
  }
}
