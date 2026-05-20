import { describe, expect, it } from "vitest";
import type { SessionMessage } from "@handagent/core/protocol/SessionMessage.ts";
import { SessionWorkspaceAskBridge } from "../../src/SessionWorkspaceAskBridge.ts";

describe("SessionWorkspaceAskBridge", () => {
  it("routes workspace ask requests to the socket bound to each session", async () => {
    const bridge = new SessionWorkspaceAskBridge();
    const sent: SessionMessage[] = [];
    bridge.bindSession("session-A", (message) => sent.push(message));

    const ask = bridge.ask({
      sessionId: "session-A",
      toolCallId: "tool-1",
      prompt: "请选择 workspace",
      candidates: [
        { id: "docs", name: "文档", description: "产品文档", isDefault: false },
        { id: "code", name: "代码", description: "源码", isDefault: true },
      ],
    });

    expect(sent).toHaveLength(1);
    const request = sent[0];
    if (request.type !== "workspace_ask_request") throw new Error("type");
    expect(request.payload.prompt).toBe("请选择 workspace");
    expect(request.payload.candidates.map((candidate) => candidate.id)).toEqual([
      "docs",
      "code",
    ]);

    bridge.handleResponse({
      requestId: request.payload.requestId,
      workspaceId: "docs",
    });

    await expect(ask).resolves.toEqual({ workspaceId: "docs" });
  });

  it("serializes multiple asks in the same session", async () => {
    const bridge = new SessionWorkspaceAskBridge();
    const sent: SessionMessage[] = [];
    bridge.bindSession("session-A", (message) => sent.push(message));

    const first = bridge.ask({
      sessionId: "session-A",
      toolCallId: "tool-1",
      prompt: "第一次",
      candidates: [
        { id: "a", name: "A", description: "A", isDefault: false },
        { id: "b", name: "B", description: "B", isDefault: false },
      ],
    });
    const second = bridge.ask({
      sessionId: "session-A",
      toolCallId: "tool-2",
      prompt: "第二次",
      candidates: [
        { id: "a", name: "A", description: "A", isDefault: false },
        { id: "b", name: "B", description: "B", isDefault: false },
      ],
    });

    expect(sent).toHaveLength(1);
    const firstRequest = sent[0];
    if (firstRequest.type !== "workspace_ask_request") throw new Error("type");
    expect(firstRequest.payload.prompt).toBe("第一次");

    bridge.handleResponse({
      requestId: firstRequest.payload.requestId,
      workspaceId: "a",
    });
    await expect(first).resolves.toEqual({ workspaceId: "a" });

    expect(sent).toHaveLength(2);
    const secondRequest = sent[1];
    if (secondRequest.type !== "workspace_ask_request") throw new Error("type");
    expect(secondRequest.payload.prompt).toBe("第二次");

    bridge.handleResponse({
      requestId: secondRequest.payload.requestId,
      cancelled: true,
    });
    await expect(second).resolves.toEqual({ cancelled: true });
  });

  it("returns cancelled when the session is closed", async () => {
    const bridge = new SessionWorkspaceAskBridge();
    const token = bridge.bindSession("session-A", () => {});

    const ask = bridge.ask({
      sessionId: "session-A",
      toolCallId: "tool-1",
      prompt: "请选择",
      candidates: [
        { id: "a", name: "A", description: "A", isDefault: false },
        { id: "b", name: "B", description: "B", isDefault: false },
      ],
    });

    bridge.unbindSession("session-A", token);

    await expect(ask).resolves.toEqual({ cancelled: true });
  });

  it("treats an empty response as cancelled", async () => {
    const bridge = new SessionWorkspaceAskBridge();
    const sent: SessionMessage[] = [];
    bridge.bindSession("session-A", (message) => sent.push(message));

    const ask = bridge.ask({
      sessionId: "session-A",
      toolCallId: "tool-1",
      prompt: "请选择",
      candidates: [
        { id: "a", name: "A", description: "A", isDefault: false },
        { id: "b", name: "B", description: "B", isDefault: false },
      ],
    });
    const request = sent[0];
    if (request.type !== "workspace_ask_request") throw new Error("type");

    bridge.handleResponse({ requestId: request.payload.requestId });

    await expect(ask).resolves.toEqual({ cancelled: true });
  });
});
