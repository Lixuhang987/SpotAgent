import { describe, expect, it } from "vitest";
import type { SessionMessage } from "@handagent/core/protocol/SessionMessage.ts";
import { SessionPermissionBridge } from "../../src/SessionPermissionBridge.ts";

describe("SessionPermissionBridge", () => {
  it("routes permission requests to the socket bound to each session", async () => {
    const bridge = new SessionPermissionBridge();
    const sessionASent: SessionMessage[] = [];
    const sessionBSent: SessionMessage[] = [];
    bridge.bindSession("session-A", (message) => sessionASent.push(message));
    bridge.bindSession("session-B", (message) => sessionBSent.push(message));

    const askA = bridge.ask({
      sessionId: "session-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });
    const askB = bridge.ask({
      sessionId: "session-B",
      toolName: "file.write",
      toolCallId: "tool-B",
      arguments: { path: "b.txt" },
    });

    expect(sessionASent).toHaveLength(1);
    expect(sessionBSent).toHaveLength(1);
    const requestA = sessionASent[0];
    const requestB = sessionBSent[0];
    expect(requestA.sessionId).toBe("session-A");
    expect(requestB.sessionId).toBe("session-B");
    if (requestA.type !== "permission_request" || requestB.type !== "permission_request") {
      throw new Error("type");
    }

    bridge.handleResponse({
      requestId: requestA.payload.requestId,
      decision: "allow",
      scope: "session",
    });
    bridge.handleResponse({
      requestId: requestB.payload.requestId,
      decision: "deny",
      reason: "no",
    });

    await expect(askA).resolves.toEqual({ decision: "allow", remember: "session" });
    await expect(askB).resolves.toEqual({ decision: "deny", reason: "no" });
  });

  it("keeps other sessions active when one session is unbound", async () => {
    const bridge = new SessionPermissionBridge();
    const sessionBSent: SessionMessage[] = [];
    bridge.bindSession("session-A", () => {});
    bridge.bindSession("session-B", (message) => sessionBSent.push(message));

    bridge.unbindSession("session-A");

    const askB = bridge.ask({
      sessionId: "session-B",
      toolName: "file.write",
      toolCallId: "tool-B",
      arguments: { path: "b.txt" },
    });

    expect(sessionBSent).toHaveLength(1);
    const requestB = sessionBSent[0];
    if (requestB.type !== "permission_request") throw new Error("type");
    bridge.handleResponse({
      requestId: requestB.payload.requestId,
      decision: "allow",
    });

    await expect(askB).resolves.toEqual({ decision: "allow" });
  });

  it("does not let a stale binding unbind a newer socket for the same session", async () => {
    const bridge = new SessionPermissionBridge();
    const firstToken = bridge.bindSession("session-A", () => {});
    const secondSent: SessionMessage[] = [];
    bridge.bindSession("session-A", (message) => secondSent.push(message));

    expect(bridge.unbindSession("session-A", firstToken)).toBe(false);

    const ask = bridge.ask({
      sessionId: "session-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });

    expect(secondSent).toHaveLength(1);
    const request = secondSent[0];
    if (request.type !== "permission_request") throw new Error("type");
    bridge.handleResponse({
      requestId: request.payload.requestId,
      decision: "allow",
    });

    await expect(ask).resolves.toEqual({ decision: "allow" });
  });

  it("ignores stale permission responses after the same session is rebound", async () => {
    const bridge = new SessionPermissionBridge();
    const firstSent: SessionMessage[] = [];
    const firstToken = bridge.bindSession("session-A", (message) => firstSent.push(message));
    const askFromFirstSocket = bridge.ask({
      sessionId: "session-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });

    const secondSent: SessionMessage[] = [];
    const secondToken = bridge.bindSession("session-A", (message) => secondSent.push(message));

    expect(firstSent).toHaveLength(1);
    const firstRequest = firstSent[0];
    if (firstRequest.type !== "permission_request") throw new Error("type");
    bridge.handleResponse(
      {
        requestId: firstRequest.payload.requestId,
        decision: "allow",
        scope: "session",
      },
      firstToken,
    );

    const staleOutcome = await Promise.race([
      askFromFirstSocket,
      Promise.resolve("pending"),
    ]);
    expect(staleOutcome).toBe("pending");

    expect(bridge.unbindSession("session-A", firstToken)).toBe(false);
    await expect(askFromFirstSocket).resolves.toEqual({
      decision: "deny",
      reason: "session closed",
    });

    const askFromSecondSocket = bridge.ask({
      sessionId: "session-A",
      toolName: "file.write",
      toolCallId: "tool-B",
      arguments: { path: "b.txt" },
    });
    expect(secondSent).toHaveLength(1);
    const secondRequest = secondSent[0];
    if (secondRequest.type !== "permission_request") throw new Error("type");
    bridge.handleResponse(
      {
        requestId: secondRequest.payload.requestId,
        decision: "allow",
      },
      secondToken,
    );

    await expect(askFromSecondSocket).resolves.toEqual({ decision: "allow" });
  });
});
