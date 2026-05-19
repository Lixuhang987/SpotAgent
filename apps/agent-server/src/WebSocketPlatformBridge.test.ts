import { describe, expect, it, vi } from "vitest";
import { WebSocketPlatformBridge } from "./WebSocketPlatformBridge.ts";
import {
  PlatformBridgeOfflineError,
  PlatformBridgeRemoteError,
  PlatformBridgeTimeoutError,
} from "@handagent/core/platform/PlatformBridge.ts";
import type { SessionMessage } from "@handagent/core/protocol/SessionMessage.ts";

function captureSends(bridge: WebSocketPlatformBridge): SessionMessage[] {
  const sent: SessionMessage[] = [];
  bridge.attach((msg) => sent.push(msg));
  return sent;
}

describe("WebSocketPlatformBridge", () => {
  it("rejects with offline error before attach", async () => {
    const bridge = new WebSocketPlatformBridge();
    await expect(bridge.call("clipboard.read", {})).rejects.toBeInstanceOf(
      PlatformBridgeOfflineError,
    );
  });

  it("resolves when matching response arrives", async () => {
    const bridge = new WebSocketPlatformBridge();
    const sent = captureSends(bridge);

    const promise = bridge.call<string>("clipboard.read", {});
    expect(sent).toHaveLength(1);
    const req = sent[0];
    expect(req.type).toBe("platform_request");
    if (req.type !== "platform_request") throw new Error("type");

    bridge.handleResponse({
      requestId: req.payload.requestId,
      status: "ok",
      result: "hello",
    });

    await expect(promise).resolves.toBe("hello");
  });

  it("rejects with remote error", async () => {
    const bridge = new WebSocketPlatformBridge();
    const sent = captureSends(bridge);
    const promise = bridge.call("clipboard.read", {});
    const req = sent[0];
    if (req.type !== "platform_request") throw new Error("type");

    bridge.handleResponse({
      requestId: req.payload.requestId,
      status: "error",
      message: "permission denied",
      code: "tcc_blocked",
    });

    await expect(promise).rejects.toBeInstanceOf(PlatformBridgeRemoteError);
    await expect(promise).rejects.toMatchObject({
      message: "permission denied",
      code: "tcc_blocked",
    });
  });

  it("rejects with timeout error if no response", async () => {
    vi.useFakeTimers();
    try {
      const bridge = new WebSocketPlatformBridge();
      captureSends(bridge);
      const promise = bridge.call("clipboard.read", {}, 500);
      const reject = expect(promise).rejects.toBeInstanceOf(PlatformBridgeTimeoutError);
      vi.advanceTimersByTime(600);
      await reject;
    } finally {
      vi.useRealTimers();
    }
  });

  it("isolates concurrent requests by requestId", async () => {
    const bridge = new WebSocketPlatformBridge();
    const sent = captureSends(bridge);

    const a = bridge.call<number>("app.frontmost", { tag: "a" });
    const b = bridge.call<number>("app.frontmost", { tag: "b" });

    const reqA = sent[0];
    const reqB = sent[1];
    if (reqA.type !== "platform_request" || reqB.type !== "platform_request") {
      throw new Error("type");
    }
    expect(reqA.payload.requestId).not.toBe(reqB.payload.requestId);

    bridge.handleResponse({ requestId: reqB.payload.requestId, status: "ok", result: 2 });
    bridge.handleResponse({ requestId: reqA.payload.requestId, status: "ok", result: 1 });

    expect(await a).toBe(1);
    expect(await b).toBe(2);
  });

  it("rejects pending requests on detach", async () => {
    const bridge = new WebSocketPlatformBridge();
    captureSends(bridge);
    const promise = bridge.call("clipboard.read", {});
    bridge.detach();
    await expect(promise).rejects.toBeInstanceOf(PlatformBridgeOfflineError);
  });

  it("ignores responses with unknown requestId", () => {
    const bridge = new WebSocketPlatformBridge();
    bridge.handleResponse({ requestId: "ghost", status: "ok", result: null });
  });
});
