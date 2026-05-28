import { describe, expect, it, vi } from "vitest";
import { WebSocketPlatformBridge } from "../../src/bridges/WebSocketPlatformBridge.ts";
import {
  PlatformBridgeOfflineError,
  PlatformBridgeRemoteError,
  PlatformBridgeTimeoutError,
} from "@handagent/core/platform/PlatformBridge.ts";
import type { PlatformBridgeMessage } from "@handagent/core/protocol/PlatformBridgeMessage.ts";

function captureSends(bridge: WebSocketPlatformBridge): PlatformBridgeMessage[] {
  const sent: PlatformBridgeMessage[] = [];
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
    expect(req.channel).toBe("platform");
    expect(req.type).toBe("platform_request");
    expect("sessionId" in req).toBe(false);
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

  it("rejects pending requests when a newer attach replaces the bridge", async () => {
    const bridge = new WebSocketPlatformBridge();
    const firstSent: PlatformBridgeMessage[] = [];
    bridge.attach((msg) => firstSent.push(msg));

    const promise = bridge.call("clipboard.read", {}, 5_000);
    expect(firstSent).toHaveLength(1);

    const rejection = promise.then(
      () => "resolved",
      (error) => error,
    );
    bridge.attach(() => {});

    await Promise.resolve();
    const outcome = await Promise.race([rejection, Promise.resolve("pending")]);
    expect(outcome).toBeInstanceOf(PlatformBridgeOfflineError);
    expect((outcome as Error).message).toContain("desktop bridge replaced");
  });

  it("keeps the current bridge attached when an older token detaches", async () => {
    const bridge = new WebSocketPlatformBridge();
    const firstToken = bridge.attach(() => {});
    const secondSent: PlatformBridgeMessage[] = [];
    const secondToken = bridge.attach((msg) => secondSent.push(msg));

    bridge.detach(firstToken, "old desktop disconnected");

    const promise = bridge.call<string>("clipboard.read", {});
    promise.catch(() => {});
    const req = secondSent[0];
    expect(req.type).toBe("platform_request");
    if (req.type !== "platform_request") throw new Error("type");

    bridge.handleResponse(
      {
        requestId: req.payload.requestId,
        status: "ok",
        result: "current",
      },
      secondToken,
    );

    await expect(promise).resolves.toBe("current");
  });

  it("ignores a response from an older bridge token for a current request", async () => {
    const bridge = new WebSocketPlatformBridge();
    const oldToken = bridge.attach(() => {});
    const sent: PlatformBridgeMessage[] = [];
    const currentToken = bridge.attach((msg) => sent.push(msg));

    const promise = bridge.call<string>("clipboard.read", {});
    const req = sent[0];
    if (req.type !== "platform_request") throw new Error("type");

    bridge.handleResponse(
      {
        requestId: req.payload.requestId,
        status: "ok",
        result: "stale",
      },
      oldToken,
    );

    const outcome = await Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve("pending"), 0)),
    ]);
    expect(outcome).toBe("pending");

    bridge.handleResponse(
      {
        requestId: req.payload.requestId,
        status: "ok",
        result: "current",
      },
      currentToken,
    );

    await expect(promise).resolves.toBe("current");
  });

  it("ignores responses with unknown requestId", () => {
    const bridge = new WebSocketPlatformBridge();
    bridge.handleResponse({ requestId: "ghost", status: "ok", result: null });
  });
});
