import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent } from "@handagent/core/runtime/AgentRuntime.ts";
import type { SessionMessage } from "@handagent/core/protocol/SessionMessage.ts";
import type { PlatformBridgeMessage } from "@handagent/core/protocol/PlatformBridgeMessage.ts";
import type { FilePermissionPolicy } from "@handagent/core/permission/FilePermissionPolicy.ts";
import { InMemorySessionStore } from "@handagent/core/storage/index.ts";
import type { SessionRouter } from "../../src/SessionRouter.ts";
import { SessionRouter as RealSessionRouter } from "../../src/SessionRouter.ts";
import { SessionPersistence } from "../../src/SessionPersistence.ts";
import { SessionPermissionBridge } from "../../src/SessionPermissionBridge.ts";
import { SessionRuntimeOrchestrator } from "../../src/SessionRuntimeOrchestrator.ts";
import { SessionWorkspaceAskBridge } from "../../src/SessionWorkspaceAskBridge.ts";
import { attachSessionSocketHandlers, resolveLLMMode } from "../../src/server.ts";

class FakeSocket extends EventEmitter {
  sent: string[] = [];

  send(raw: string): void {
    this.sent.push(raw);
  }
}

function userMessage(sessionId: string, text: string): SessionMessage {
  return {
    type: "user_message",
    sessionId,
    messageId: `message-${sessionId}-${text}`,
    timestamp: new Date().toISOString(),
    payload: { text },
  };
}

function platformHello(messageId: string): PlatformBridgeMessage {
  return {
    channel: "platform",
    type: "platform_bridge_hello",
    messageId,
    timestamp: new Date().toISOString(),
    payload: { agent: "test" },
  };
}

function permissionResponse(
  requestId: string,
  decision: "allow" | "deny" = "allow",
): SessionMessage {
  return {
    type: "permission_response",
    sessionId: "session-A",
    messageId: `response-${requestId}`,
    timestamp: new Date().toISOString(),
    payload: { requestId, decision, scope: "session" },
  };
}

function workspaceAskResponse(requestId: string, workspaceId: string): SessionMessage {
  return {
    type: "workspace_ask_response",
    sessionId: "session-A",
    messageId: `workspace-response-${requestId}`,
    timestamp: new Date().toISOString(),
    payload: { requestId, workspaceId },
  };
}

async function emitMessage(
  socket: FakeSocket,
  message: SessionMessage | PlatformBridgeMessage,
): Promise<void> {
  socket.emit("message", Buffer.from(JSON.stringify(message)));
  await Promise.resolve();
}

describe("attachSessionSocketHandlers", () => {
  it("binds every user_message session on a socket and clears them all on close", async () => {
    const socket = new FakeSocket();
    const router = {
      receive: vi.fn(async () => {}),
      interruptSession: vi.fn(),
    } as unknown as SessionRouter;
    const permissionBridge = {
      bindSession: vi.fn().mockReturnValueOnce(101).mockReturnValueOnce(102),
      unbindSession: vi.fn().mockReturnValue(true),
    } as unknown as SessionPermissionBridge;
    const permissionPolicy = {
      clearSessionRules: vi.fn(),
    } as unknown as FilePermissionPolicy;

    attachSessionSocketHandlers(socket as never, {
      router,
      permissionBridge,
      permissionPolicy,
    });

    await emitMessage(socket, userMessage("session-A", "first"));
    await emitMessage(socket, userMessage("session-B", "second"));

    expect(permissionBridge.bindSession).toHaveBeenCalledWith(
      "session-A",
      expect.any(Function),
    );
    expect(permissionBridge.bindSession).toHaveBeenCalledWith(
      "session-B",
      expect.any(Function),
    );

    socket.emit("close");

    expect(permissionBridge.unbindSession).toHaveBeenCalledWith("session-A", 101);
    expect(permissionBridge.unbindSession).toHaveBeenCalledWith("session-B", 102);
    expect(router.interruptSession).toHaveBeenCalledWith("session-A", expect.any(Function));
    expect(router.interruptSession).toHaveBeenCalledWith("session-B", expect.any(Function));
    expect(permissionPolicy.clearSessionRules).toHaveBeenCalledWith("session-A");
    expect(permissionPolicy.clearSessionRules).toHaveBeenCalledWith("session-B");
  });

  it("does not clear a session binding or session rules when a stale socket closes after reconnect", async () => {
    const socket = new FakeSocket();
    const router = {
      receive: vi.fn(async () => {}),
      interruptSession: vi.fn(),
    } as unknown as SessionRouter;
    const permissionBridge = {
      bindSession: vi.fn().mockReturnValue(101),
      unbindSession: vi.fn().mockReturnValue(false),
    } as unknown as SessionPermissionBridge;
    const permissionPolicy = {
      clearSessionRules: vi.fn(),
    } as unknown as FilePermissionPolicy;

    attachSessionSocketHandlers(socket as never, {
      router,
      permissionBridge,
      permissionPolicy,
    });

    await emitMessage(socket, userMessage("session-A", "first"));
    socket.emit("close");

    expect(permissionBridge.unbindSession).toHaveBeenCalledWith("session-A", 101);
    expect(router.interruptSession).not.toHaveBeenCalled();
    expect(permissionPolicy.clearSessionRules).not.toHaveBeenCalled();
  });

  it("ignores stale permission responses and only closes pending asks owned by the stale socket", async () => {
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    const router = {
      receive: vi.fn(async () => {}),
    } as unknown as SessionRouter;
    const permissionBridge = new SessionPermissionBridge();
    const permissionPolicy = {
      clearSessionRules: vi.fn(),
    } as unknown as FilePermissionPolicy;

    attachSessionSocketHandlers(firstSocket as never, {
      router,
      permissionBridge,
      permissionPolicy,
    });
    attachSessionSocketHandlers(secondSocket as never, {
      router,
      permissionBridge,
      permissionPolicy,
    });

    await emitMessage(firstSocket, userMessage("session-A", "first"));
    const staleAsk = permissionBridge.ask({
      sessionId: "session-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });
    const staleRequest = JSON.parse(firstSocket.sent[0]) as SessionMessage;
    if (staleRequest.type !== "permission_request") throw new Error("type");

    await emitMessage(secondSocket, userMessage("session-A", "reconnect"));
    await emitMessage(
      firstSocket,
      permissionResponse(staleRequest.payload.requestId, "allow"),
    );

    const staleOutcome = await Promise.race([
      staleAsk,
      Promise.resolve("pending"),
    ]);
    expect(staleOutcome).toBe("pending");

    firstSocket.emit("close");
    await expect(staleAsk).resolves.toEqual({
      decision: "deny",
      reason: "session closed",
    });
    expect(permissionPolicy.clearSessionRules).not.toHaveBeenCalled();

    const currentAsk = permissionBridge.ask({
      sessionId: "session-A",
      toolName: "file.write",
      toolCallId: "tool-B",
      arguments: { path: "b.txt" },
    });
    const currentRequest = JSON.parse(secondSocket.sent[0]) as SessionMessage;
    if (currentRequest.type !== "permission_request") throw new Error("type");
    await emitMessage(
      secondSocket,
      permissionResponse(currentRequest.payload.requestId, "allow"),
    );

    await expect(currentAsk).resolves.toEqual({ decision: "allow", remember: "session" });
  });

  it("keeps the same binding token for repeated user messages on one socket", async () => {
    const socket = new FakeSocket();
    const router = {
      receive: vi.fn(async () => {}),
    } as unknown as SessionRouter;
    const permissionBridge = new SessionPermissionBridge();

    attachSessionSocketHandlers(socket as never, {
      router,
      permissionBridge,
    });

    await emitMessage(socket, userMessage("session-A", "first"));
    const ask = permissionBridge.ask({
      sessionId: "session-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });
    const request = JSON.parse(socket.sent[0]) as SessionMessage;
    if (request.type !== "permission_request") throw new Error("type");

    await emitMessage(socket, userMessage("session-A", "second"));
    await emitMessage(socket, permissionResponse(request.payload.requestId, "allow"));

    await expect(ask).resolves.toEqual({ decision: "allow", remember: "session" });
  });

  it("routes workspace ask responses through the current socket binding", async () => {
    const socket = new FakeSocket();
    const router = {
      receive: vi.fn(async () => {}),
    } as unknown as SessionRouter;
    const workspaceAskBridge = new SessionWorkspaceAskBridge();

    attachSessionSocketHandlers(socket as never, {
      router,
      workspaceAskBridge,
    });

    await emitMessage(socket, userMessage("session-A", "first"));
    const ask = workspaceAskBridge.ask({
      sessionId: "session-A",
      toolCallId: "tool-1",
      prompt: "请选择 workspace",
      candidates: [
        { id: "docs", name: "文档", description: "文档", isDefault: false },
        { id: "code", name: "代码", description: "代码", isDefault: false },
      ],
    });
    const request = JSON.parse(socket.sent[0]) as SessionMessage;
    if (request.type !== "workspace_ask_request") throw new Error("type");

    await emitMessage(socket, workspaceAskResponse(request.payload.requestId, "docs"));

    await expect(ask).resolves.toEqual({ workspaceId: "docs" });
  });

  it("routes permission responses for session ids that contain colons", async () => {
    const socket = new FakeSocket();
    const router = {
      receive: vi.fn(async () => {}),
    } as unknown as SessionRouter;
    const permissionBridge = new SessionPermissionBridge();

    attachSessionSocketHandlers(socket as never, {
      router,
      permissionBridge,
    });

    await emitMessage(socket, userMessage("workspace:session-A", "first"));
    const ask = permissionBridge.ask({
      sessionId: "workspace:session-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });
    const request = JSON.parse(socket.sent[0]) as SessionMessage;
    if (request.type !== "permission_request") throw new Error("type");

    await emitMessage(socket, permissionResponse(request.payload.requestId, "allow"));

    await expect(ask).resolves.toEqual({ decision: "allow", remember: "session" });
  });

  it("interrupts the active run owned by a socket when that socket closes", async () => {
    const socket = new FakeSocket();
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-20T00:00:00.000Z",
    );
    let runtimeSignal: AbortSignal | undefined;
    let finishRun: ((result: { messages: AgentMessage[]; bubbles: [] }) => void) | undefined;
    const runStarted = Promise.withResolvers<void>();
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        runWithMessages(messages, _onEvent: (event: AgentRuntimeEvent) => void, runOptions) {
          runtimeSignal = runOptions?.signal;
          runOptions?.signal.addEventListener("abort", () => {
            finishRun?.({
              messages: [
                ...messages,
                {
                  role: "assistant" as const,
                  content: "late assistant after close",
                },
              ],
              bubbles: [],
            });
          });
          runStarted.resolve();
          return new Promise((resolve) => {
            finishRun = resolve;
          });
        },
      },
      persistence,
      () => "2026-05-20T00:00:00.000Z",
    );
    const router = new RealSessionRouter(
      orchestrator,
      persistence,
      () => "2026-05-20T00:00:00.000Z",
    );
    const permissionBridge = new SessionPermissionBridge();

    await persistence.ensureSession("session-A");
    attachSessionSocketHandlers(socket as never, {
      router,
      permissionBridge,
    });

    await emitMessage(socket, userMessage("session-A", "close me"));
    await runStarted.promise;

    socket.emit("close");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runtimeSignal?.aborted).toBe(true);
    expect(orchestrator.isSessionRunning("session-A")).toBe(false);
    expect(await persistence.getMessages("session-A")).toEqual([
      { role: "user", content: "close me" },
    ]);
  });

  it("detaches bridge sockets with the token returned by attach", async () => {
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    const router = {
      receive: vi.fn(async () => {}),
    } as unknown as SessionRouter;
    const bridge = {
      attach: vi.fn().mockReturnValueOnce(101).mockReturnValueOnce(102),
      detach: vi.fn(),
      handleResponse: vi.fn(),
    };

    attachSessionSocketHandlers(firstSocket as never, {
      router,
      bridge: bridge as never,
    });
    attachSessionSocketHandlers(secondSocket as never, {
      router,
      bridge: bridge as never,
    });

    await emitMessage(firstSocket, platformHello("bridge-1"));
    await emitMessage(secondSocket, platformHello("bridge-2"));

    firstSocket.emit("close");
    secondSocket.emit("close");

    expect(bridge.detach).toHaveBeenCalledWith(101);
    expect(bridge.detach).toHaveBeenCalledWith(102);
  });
});

describe("resolveLLMMode", () => {
  it("uses mock mode only when HANDAGENT_LLM_MODE is explicitly mock", () => {
    expect(resolveLLMMode({})).toBe("settings");
    expect(resolveLLMMode({ HANDAGENT_LLM_MODE: "settings" })).toBe("settings");
    expect(resolveLLMMode({ HANDAGENT_LLM_MODE: "mock" })).toBe("mock");
  });
});
