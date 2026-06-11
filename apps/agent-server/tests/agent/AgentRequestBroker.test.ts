import { describe, expect, it } from "vitest";
import { AgentRequestBroker } from "../../src/agent/AgentRequestBroker.ts";

describe("AgentRequestBroker", () => {
  it("emits permission requests through the agent event stream and resolves from client_response ops", async () => {
    const broker = new AgentRequestBroker({ defaultTimeoutMs: 1000 });
    const emitted: string[] = [];
    broker.bindThread("thread-1", (event) => {
      emitted.push(`${event.type}:${event.payload.type}:${event.payload.requestId}`);
    });

    const ask = broker.askPermission({
      threadId: "thread-1",
      toolName: "file.write",
      toolCallId: "tool-1",
      arguments: { path: "a.txt" },
    });

    const requestId = emitted[0]?.split(":").slice(2).join(":");
    expect(requestId).toMatch(/^thread-1:/);

    broker.handleOp({
      type: "client_response",
      opId: requestId,
      timestamp: "2026-06-11T00:00:00.000Z",
      payload: {
        response: {
          type: "permission.answered",
          requestId,
          timestamp: "2026-06-11T00:00:00.000Z",
          payload: { decision: "allow", scope: "thread" },
        },
      },
    });

    await expect(ask).resolves.toEqual({ decision: "allow", remember: "thread" });
  });

  it("serializes workspace requests per thread and resolves each from client_response ops", async () => {
    const broker = new AgentRequestBroker({ defaultTimeoutMs: 1000 });
    const emitted: string[] = [];
    broker.bindThread("thread-1", (event) => {
      emitted.push(`${event.payload.type}:${event.payload.requestId}`);
    });

    const first = broker.askWorkspace({
      threadId: "thread-1",
      toolCallId: "tool-1",
      prompt: "choose",
      candidates: [{ id: "docs", name: "Docs", isDefault: false }],
    });
    const second = broker.askWorkspace({
      threadId: "thread-1",
      toolCallId: "tool-2",
      prompt: "choose again",
      candidates: [{ id: "code", name: "Code", isDefault: false }],
    });

    expect(emitted).toHaveLength(1);
    const firstRequestId = emitted[0].split(":").slice(1).join(":");
    broker.handleOp({
      type: "client_response",
      opId: firstRequestId,
      timestamp: "2026-06-11T00:00:00.000Z",
      payload: {
        response: {
          type: "workspace.answered",
          requestId: firstRequestId,
          timestamp: "2026-06-11T00:00:00.000Z",
          payload: { workspaceId: "docs" },
        },
      },
    });

    await expect(first).resolves.toEqual({ workspaceId: "docs" });
    expect(emitted).toHaveLength(2);

    const secondRequestId = emitted[1].split(":").slice(1).join(":");
    broker.handleOp({
      type: "client_response",
      opId: secondRequestId,
      timestamp: "2026-06-11T00:00:00.000Z",
      payload: {
        response: {
          type: "workspace.answered",
          requestId: secondRequestId,
          timestamp: "2026-06-11T00:00:00.000Z",
          payload: { cancelled: true },
        },
      },
    });

    await expect(second).resolves.toEqual({ cancelled: true });
  });

  it("cancels pending permission and workspace requests when a thread is interrupted", async () => {
    const broker = new AgentRequestBroker({ defaultTimeoutMs: 1000 });
    broker.bindThread("thread-1", () => {});

    const permission = broker.askPermission({
      threadId: "thread-1",
      toolName: "file.write",
      toolCallId: "tool-1",
      arguments: { path: "a.txt" },
    });
    const workspace = broker.askWorkspace({
      threadId: "thread-1",
      toolCallId: "tool-2",
      prompt: "choose",
      candidates: [{ id: "docs", name: "Docs", isDefault: false }],
    });

    broker.cancelPendingForThread("thread-1");

    await expect(permission).resolves.toEqual({
      decision: "deny",
      reason: "thread interrupted",
    });
    await expect(workspace).resolves.toEqual({ cancelled: true });
  });

});
