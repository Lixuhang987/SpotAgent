import { describe, expect, it } from "vitest";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import { ThreadPermissionBridge } from "../../src/bridges/ThreadPermissionBridge.ts";

describe("ThreadPermissionBridge", () => {
  it("routes permission requests to the socket bound to each thread", async () => {
    const bridge = new ThreadPermissionBridge();
    const threadASent: ServerRequest[] = [];
    const threadBSent: ServerRequest[] = [];
    bridge.bindThread("Thread-A", (message) => threadASent.push(message));
    bridge.bindThread("Thread-B", (message) => threadBSent.push(message));

    const askA = bridge.ask({
      threadId: "Thread-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });
    const askB = bridge.ask({
      threadId: "Thread-B",
      toolName: "file.write",
      toolCallId: "tool-B",
      arguments: { path: "b.txt" },
    });

    expect(threadASent).toHaveLength(1);
    expect(threadBSent).toHaveLength(1);
    const requestA = threadASent[0];
    const requestB = threadBSent[0];
    expect(requestA.threadId).toBe("Thread-A");
    expect(requestB.threadId).toBe("Thread-B");
    if (requestA.type !== "permission.requested" || requestB.type !== "permission.requested") {
      throw new Error("type");
    }

    bridge.handleResponse(permissionAnswer(requestA.requestId, "allow", "thread"));
    bridge.handleResponse(permissionAnswer(requestB.requestId, "deny", undefined, "no"));

    await expect(askA).resolves.toEqual({ decision: "allow", remember: "thread" });
    await expect(askB).resolves.toEqual({ decision: "deny", reason: "no" });
  });

  it("keeps other threads active when one thread is unbound", async () => {
    const bridge = new ThreadPermissionBridge();
    const threadBSent: ServerRequest[] = [];
    bridge.bindThread("Thread-A", () => {});
    bridge.bindThread("Thread-B", (message) => threadBSent.push(message));

    bridge.unbindThread("Thread-A");

    const askB = bridge.ask({
      threadId: "Thread-B",
      toolName: "file.write",
      toolCallId: "tool-B",
      arguments: { path: "b.txt" },
    });

    expect(threadBSent).toHaveLength(1);
    const requestB = threadBSent[0];
    if (requestB.type !== "permission.requested") throw new Error("type");
    bridge.handleResponse(permissionAnswer(requestB.requestId, "allow"));

    await expect(askB).resolves.toEqual({ decision: "allow" });
  });

  it("does not let a stale binding unbind a newer socket for the same thread", async () => {
    const bridge = new ThreadPermissionBridge();
    const firstToken = bridge.bindThread("Thread-A", () => {});
    const secondSent: ServerRequest[] = [];
    bridge.bindThread("Thread-A", (message) => secondSent.push(message));

    expect(bridge.unbindThread("Thread-A", firstToken)).toBe(false);

    const ask = bridge.ask({
      threadId: "Thread-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });

    expect(secondSent).toHaveLength(1);
    const request = secondSent[0];
    if (request.type !== "permission.requested") throw new Error("type");
    bridge.handleResponse(permissionAnswer(request.requestId, "allow"));

    await expect(ask).resolves.toEqual({ decision: "allow" });
  });

  it("ignores stale permission responses after the same thread is rebound", async () => {
    const bridge = new ThreadPermissionBridge();
    const firstSent: ServerRequest[] = [];
    const firstToken = bridge.bindThread("Thread-A", (message) => firstSent.push(message));
    const askFromFirstSocket = bridge.ask({
      threadId: "Thread-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });

    const secondSent: ServerRequest[] = [];
    const secondToken = bridge.bindThread("Thread-A", (message) => secondSent.push(message));
    expect(secondSent).toEqual(firstSent);

    expect(firstSent).toHaveLength(1);
    const firstRequest = firstSent[0];
    if (firstRequest.type !== "permission.requested") throw new Error("type");
    bridge.handleResponse(
      permissionAnswer(firstRequest.requestId, "allow", "thread"),
      firstToken,
    );

    const staleOutcome = await Promise.race([
      askFromFirstSocket,
      Promise.resolve("pending"),
    ]);
    expect(staleOutcome).toBe("pending");

    expect(bridge.unbindThread("Thread-A", firstToken)).toBe(false);
    bridge.handleResponse(
      permissionAnswer(firstRequest.requestId, "allow"),
      secondToken,
    );
    await expect(askFromFirstSocket).resolves.toEqual({ decision: "allow" });

    const askFromSecondSocket = bridge.ask({
      threadId: "Thread-A",
      toolName: "file.write",
      toolCallId: "tool-B",
      arguments: { path: "b.txt" },
    });
    expect(secondSent).toHaveLength(2);
    const secondRequest = secondSent[1];
    if (secondRequest.type !== "permission.requested") throw new Error("type");
    bridge.handleResponse(
      permissionAnswer(secondRequest.requestId, "allow"),
      secondToken,
    );

    await expect(askFromSecondSocket).resolves.toEqual({ decision: "allow" });
  });

  it("replays pending requests to a rebound thread socket and accepts the new socket response", async () => {
    const bridge = new ThreadPermissionBridge();
    const firstSent: ServerRequest[] = [];
    const firstToken = bridge.bindThread("Thread-A", (message) => firstSent.push(message));
    const ask = bridge.ask({
      threadId: "Thread-A",
      toolName: "ocr.read",
      toolCallId: "tool-A",
      arguments: { imageBase64: "stub", mimeType: "image/png" },
    });

    expect(firstSent).toHaveLength(1);
    const firstRequest = firstSent[0];
    if (firstRequest.type !== "permission.requested") throw new Error("type");

    const secondSent: ServerRequest[] = [];
    const secondToken = bridge.bindThread("Thread-A", (message) => secondSent.push(message));

    expect(secondToken).not.toBe(firstToken);
    expect(secondSent).toEqual([firstRequest]);

    bridge.handleResponse(permissionAnswer(firstRequest.requestId, "allow"), secondToken);

    await expect(ask).resolves.toEqual({ decision: "allow" });
  });
});

function permissionAnswer(
  requestId: string,
  decision: "allow" | "deny",
  scope?: "once" | "thread" | "always",
  reason?: string,
): Extract<ClientResponse, { type: "permission.answered" }> {
  return {
    type: "permission.answered",
    requestId,
    timestamp: "2026-06-04T00:00:00.000Z",
    payload: {
      decision,
      scope,
      reason,
    },
  };
}
