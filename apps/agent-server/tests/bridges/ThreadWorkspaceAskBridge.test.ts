import { describe, expect, it } from "vitest";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import { ThreadWorkspaceAskBridge } from "../../src/bridges/ThreadWorkspaceAskBridge.ts";

describe("ThreadWorkspaceAskBridge", () => {
  it("routes workspace requests to the socket bound to each thread", async () => {
    const bridge = new ThreadWorkspaceAskBridge();
    const sent: ServerRequest[] = [];
    bridge.bindThread("Thread-A", (message) => sent.push(message));

    const ask = bridge.ask({
      threadId: "Thread-A",
      toolCallId: "tool-1",
      prompt: "请选择 workspace",
      candidates: [
        { id: "docs", name: "文档", description: "产品文档", isDefault: false },
        { id: "code", name: "代码", description: "源码", isDefault: true },
      ],
    });

    expect(sent).toHaveLength(1);
    const request = sent[0];
    if (request.type !== "workspace.requested") throw new Error("type");
    expect(request.payload.prompt).toBe("请选择 workspace");
    expect(request.payload.candidates.map((candidate) => candidate.id)).toEqual([
      "docs",
      "code",
    ]);

    bridge.handleResponse(workspaceAnswer(request.requestId, "docs"));

    await expect(ask).resolves.toEqual({ workspaceId: "docs" });
  });

  it("serializes multiple workspace requests in the same thread", async () => {
    const bridge = new ThreadWorkspaceAskBridge();
    const sent: ServerRequest[] = [];
    bridge.bindThread("Thread-A", (message) => sent.push(message));

    const first = bridge.ask({
      threadId: "Thread-A",
      toolCallId: "tool-1",
      prompt: "第一次",
      candidates: [
        { id: "a", name: "A", description: "A", isDefault: false },
        { id: "b", name: "B", description: "B", isDefault: false },
      ],
    });
    const second = bridge.ask({
      threadId: "Thread-A",
      toolCallId: "tool-2",
      prompt: "第二次",
      candidates: [
        { id: "a", name: "A", description: "A", isDefault: false },
        { id: "b", name: "B", description: "B", isDefault: false },
      ],
    });

    expect(sent).toHaveLength(1);
    const firstRequest = sent[0];
    if (firstRequest.type !== "workspace.requested") throw new Error("type");
    expect(firstRequest.payload.prompt).toBe("第一次");

    bridge.handleResponse(workspaceAnswer(firstRequest.requestId, "a"));
    await expect(first).resolves.toEqual({ workspaceId: "a" });

    expect(sent).toHaveLength(2);
    const secondRequest = sent[1];
    if (secondRequest.type !== "workspace.requested") throw new Error("type");
    expect(secondRequest.payload.prompt).toBe("第二次");

    bridge.handleResponse(workspaceAnswer(secondRequest.requestId, undefined, true));
    await expect(second).resolves.toEqual({ cancelled: true });
  });

  it("returns cancelled when the thread is closed", async () => {
    const bridge = new ThreadWorkspaceAskBridge();
    const token = bridge.bindThread("Thread-A", () => {});

    const ask = bridge.ask({
      threadId: "Thread-A",
      toolCallId: "tool-1",
      prompt: "请选择",
      candidates: [
        { id: "a", name: "A", description: "A", isDefault: false },
        { id: "b", name: "B", description: "B", isDefault: false },
      ],
    });

    bridge.unbindThread("Thread-A", token);

    await expect(ask).resolves.toEqual({ cancelled: true });
  });

  it("treats an empty response as cancelled", async () => {
    const bridge = new ThreadWorkspaceAskBridge();
    const sent: ServerRequest[] = [];
    bridge.bindThread("Thread-A", (message) => sent.push(message));

    const ask = bridge.ask({
      threadId: "Thread-A",
      toolCallId: "tool-1",
      prompt: "请选择",
      candidates: [
        { id: "a", name: "A", description: "A", isDefault: false },
        { id: "b", name: "B", description: "B", isDefault: false },
      ],
    });
    const request = sent[0];
    if (request.type !== "workspace.requested") throw new Error("type");

    bridge.handleResponse(workspaceAnswer(request.requestId));

    await expect(ask).resolves.toEqual({ cancelled: true });
  });
});

function workspaceAnswer(
  requestId: string,
  workspaceId?: string,
  cancelled?: boolean,
): Extract<ClientResponse, { type: "workspace.answered" }> {
  return {
    type: "workspace.answered",
    requestId,
    timestamp: "2026-06-04T00:00:00.000Z",
    payload: {
      workspaceId,
      cancelled,
    },
  };
}
