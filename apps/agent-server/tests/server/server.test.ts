import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent } from "@handagent/core/runtime/AgentRuntime.ts";
import type { PlatformBridgeMessage } from "@handagent/core/protocol/PlatformBridgeMessage.ts";
import type { SessionCommand } from "@handagent/core/protocol/SessionCommand.ts";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type { FilePermissionPolicy } from "@handagent/core/permission/FilePermissionPolicy.ts";
import type { MCPClient } from "@handagent/core/mcp/MCPClient.ts";
import { InMemorySessionStore } from "@handagent/core/storage/index.ts";
import { SessionPermissionBridge } from "../../src/bridges/SessionPermissionBridge.ts";
import { SessionPersistence } from "../../src/session/SessionPersistence.ts";
import { SessionRuntimeOrchestrator } from "../../src/session/SessionRuntimeOrchestrator.ts";
import { SessionCommandRouter } from "../../src/session/SessionCommandRouter.ts";
import { SessionEventPublisher } from "../../src/session/SessionEventPublisher.ts";
import { SessionWorkspaceAskBridge } from "../../src/bridges/SessionWorkspaceAskBridge.ts";
import {
  attachSessionSocketHandlers,
  createMCPClientFromConfig,
  resolveLLMMode,
} from "../../src/server/server.ts";

class FakeSocket extends EventEmitter {
  sent: string[] = [];

  send(raw: string): void {
    this.sent.push(raw);
  }
}

function turnStart(sessionId: string, text: string): SessionCommand {
  return {
    type: "turn_start",
    sessionId,
    commandId: `message-${sessionId}-${text}`,
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
): ClientResponse {
  return {
    type: "permission_answer",
    requestId,
    timestamp: new Date().toISOString(),
    payload: { decision, scope: "session" },
  };
}

function workspaceAskResponse(requestId: string, workspaceId: string): ClientResponse {
  return {
    type: "workspace_answer",
    requestId,
    timestamp: new Date().toISOString(),
    payload: { workspaceId },
  };
}

async function emitMessage(
  socket: FakeSocket,
  message: SessionCommand | ClientResponse | PlatformBridgeMessage,
): Promise<void> {
  socket.emit("message", Buffer.from(JSON.stringify(message)));
  await Promise.resolve();
}

function makeHandlerDependencies(options: {
  commandRouter?: Partial<SessionCommandRouter>;
  eventPublisher?: SessionEventPublisher;
} = {}) {
  return {
    commandRouter: {
      receive: vi.fn(async () => {}),
      interruptSession: vi.fn(),
      handleResponse: vi.fn(),
      ...options.commandRouter,
    } as unknown as SessionCommandRouter,
    eventPublisher: options.eventPublisher ?? new SessionEventPublisher(),
  };
}

function lastSent<T>(socket: FakeSocket): T {
  return JSON.parse(socket.sent.at(-1) ?? "null") as T;
}

describe("attachSessionSocketHandlers", () => {
  it("binds every turn_start session on a socket and clears them all on close", async () => {
    const socket = new FakeSocket();
    const { commandRouter, eventPublisher } = makeHandlerDependencies();
    const permissionBridge = {
      bindSession: vi.fn().mockReturnValueOnce(101).mockReturnValueOnce(102),
      unbindSession: vi.fn().mockReturnValue(true),
    } as unknown as SessionPermissionBridge;
    const permissionPolicy = {
      clearSessionRules: vi.fn(),
    } as unknown as FilePermissionPolicy;

    attachSessionSocketHandlers(socket as never, {
      commandRouter,
      eventPublisher,
      permissionBridge,
      permissionPolicy,
    });

    await emitMessage(socket, turnStart("session-A", "first"));
    await emitMessage(socket, turnStart("session-B", "second"));

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
    expect(commandRouter.interruptSession).toHaveBeenCalledWith("session-A");
    expect(commandRouter.interruptSession).toHaveBeenCalledWith("session-B");
    expect(permissionPolicy.clearSessionRules).toHaveBeenCalledWith("session-A");
    expect(permissionPolicy.clearSessionRules).toHaveBeenCalledWith("session-B");
  });

  it("does not clear a session binding or session rules when a stale socket closes after reconnect", async () => {
    const socket = new FakeSocket();
    const { commandRouter, eventPublisher } = makeHandlerDependencies();
    const permissionBridge = {
      bindSession: vi.fn().mockReturnValue(101),
      unbindSession: vi.fn().mockReturnValue(false),
    } as unknown as SessionPermissionBridge;
    const permissionPolicy = {
      clearSessionRules: vi.fn(),
    } as unknown as FilePermissionPolicy;

    attachSessionSocketHandlers(socket as never, {
      commandRouter,
      eventPublisher,
      permissionBridge,
      permissionPolicy,
    });

    await emitMessage(socket, turnStart("session-A", "first"));
    socket.emit("close");

    expect(permissionBridge.unbindSession).toHaveBeenCalledWith("session-A", 101);
    expect(commandRouter.interruptSession).not.toHaveBeenCalled();
    expect(permissionPolicy.clearSessionRules).not.toHaveBeenCalled();
  });

  it("ignores stale permission responses and only closes pending asks owned by the stale socket", async () => {
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    const firstDeps = makeHandlerDependencies();
    const secondDeps = makeHandlerDependencies();
    const permissionBridge = new SessionPermissionBridge();
    const permissionPolicy = {
      clearSessionRules: vi.fn(),
    } as unknown as FilePermissionPolicy;

    attachSessionSocketHandlers(firstSocket as never, {
      ...firstDeps,
      permissionBridge,
      permissionPolicy,
    });
    attachSessionSocketHandlers(secondSocket as never, {
      ...secondDeps,
      permissionBridge,
      permissionPolicy,
    });

    await emitMessage(firstSocket, turnStart("session-A", "first"));
    const staleAsk = permissionBridge.ask({
      sessionId: "session-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });
    const staleRequest = lastSent<ServerRequest>(firstSocket);
    if (staleRequest.type !== "permission_ask") throw new Error("type");

    await emitMessage(secondSocket, turnStart("session-A", "reconnect"));
    await emitMessage(
      firstSocket,
      permissionResponse(staleRequest.requestId, "allow"),
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
    expect(firstDeps.commandRouter.interruptSession).not.toHaveBeenCalled();

    const currentAsk = permissionBridge.ask({
      sessionId: "session-A",
      toolName: "file.write",
      toolCallId: "tool-B",
      arguments: { path: "b.txt" },
    });
    const currentRequest = lastSent<ServerRequest>(secondSocket);
    if (currentRequest.type !== "permission_ask") throw new Error("type");
    await emitMessage(
      secondSocket,
      permissionResponse(currentRequest.requestId, "allow"),
    );

    await expect(currentAsk).resolves.toEqual({ decision: "allow", remember: "session" });
  });

  it("keeps the same binding token for repeated turn_start commands on one socket", async () => {
    const socket = new FakeSocket();
    const deps = makeHandlerDependencies();
    const permissionBridge = new SessionPermissionBridge();

    attachSessionSocketHandlers(socket as never, {
      ...deps,
      permissionBridge,
    });

    await emitMessage(socket, turnStart("session-A", "first"));
    const ask = permissionBridge.ask({
      sessionId: "session-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });
    const request = lastSent<ServerRequest>(socket);
    if (request.type !== "permission_ask") throw new Error("type");

    await emitMessage(socket, turnStart("session-A", "second"));
    await emitMessage(socket, permissionResponse(request.requestId, "allow"));

    await expect(ask).resolves.toEqual({ decision: "allow", remember: "session" });
  });

  it("routes workspace ask responses through the current socket binding", async () => {
    const socket = new FakeSocket();
    const deps = makeHandlerDependencies();
    const workspaceAskBridge = new SessionWorkspaceAskBridge();

    attachSessionSocketHandlers(socket as never, {
      ...deps,
      workspaceAskBridge,
    });

    await emitMessage(socket, turnStart("session-A", "first"));
    const ask = workspaceAskBridge.ask({
      sessionId: "session-A",
      toolCallId: "tool-1",
      prompt: "请选择 workspace",
      candidates: [
        { id: "docs", name: "文档", description: "文档", isDefault: false },
        { id: "code", name: "代码", description: "代码", isDefault: false },
      ],
    });
    const request = lastSent<ServerRequest>(socket);
    if (request.type !== "workspace_ask") throw new Error("type");

    await emitMessage(socket, workspaceAskResponse(request.requestId, "docs"));

    await expect(ask).resolves.toEqual({ workspaceId: "docs" });
  });

  it("routes permission responses for session ids that contain colons", async () => {
    const socket = new FakeSocket();
    const deps = makeHandlerDependencies();
    const permissionBridge = new SessionPermissionBridge();

    attachSessionSocketHandlers(socket as never, {
      ...deps,
      permissionBridge,
    });

    await emitMessage(socket, turnStart("workspace:session-A", "first"));
    const ask = permissionBridge.ask({
      sessionId: "workspace:session-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });
    const request = lastSent<ServerRequest>(socket);
    if (request.type !== "permission_ask") throw new Error("type");

    await emitMessage(socket, permissionResponse(request.requestId, "allow"));

    await expect(ask).resolves.toEqual({ decision: "allow", remember: "session" });
  });

  it("interrupts the active run owned by a socket when that socket closes", async () => {
    const socket = new FakeSocket();
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-20T00:00:00.000Z",
    );
    let runtimeSignal: AbortSignal | undefined;
    let finishRun: ((result: { messages: AgentMessage[] }) => void) | undefined;
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
    const eventPublisher = new SessionEventPublisher();
    const commandRouter = new SessionCommandRouter(
      orchestrator,
      persistence,
      eventPublisher,
      () => "2026-05-20T00:00:00.000Z",
    );
    const permissionBridge = new SessionPermissionBridge();

    await persistence.ensureSession("session-A");
    attachSessionSocketHandlers(socket as never, {
      commandRouter,
      eventPublisher,
      permissionBridge,
    });

    await emitMessage(socket, turnStart("session-A", "close me"));
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
    const firstDeps = makeHandlerDependencies();
    const secondDeps = makeHandlerDependencies();
    const bridge = {
      attach: vi.fn().mockReturnValueOnce(101).mockReturnValueOnce(102),
      detach: vi.fn(),
      handleResponse: vi.fn(),
    };

    attachSessionSocketHandlers(firstSocket as never, {
      ...firstDeps,
      bridge: bridge as never,
    });
    attachSessionSocketHandlers(secondSocket as never, {
      ...secondDeps,
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

describe("createMCPClientFromConfig", () => {
  it("routes bundled Computer Use MCP config to the HandAgent native client", () => {
    const StdioMCPClient = vi.fn(() => makeNoopMCPClient("stdio"));
    const StreamableHttpMCPClient = vi.fn(() => makeNoopMCPClient("http"));
    const ComputerUseMCPClient = vi.fn(() => makeNoopMCPClient("computer-use"));

    const client = createMCPClientFromConfig(
      {
        id: "computer_use",
        title: "Computer Use",
        transport: "stdio",
        command: "./Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
        args: ["mcp"],
      },
      {
        StdioMCPClient: StdioMCPClient as never,
        StreamableHttpMCPClient: StreamableHttpMCPClient as never,
        ComputerUseMCPClient: ComputerUseMCPClient as never,
      },
      {
        platform: {} as never,
      },
    );

    expect(client.serverInfo()?.name).toBe("computer-use");
    expect(ComputerUseMCPClient).toHaveBeenCalledWith({
      serverId: "computer_use",
      platform: {},
    });
    expect(StdioMCPClient).not.toHaveBeenCalled();
    expect(StreamableHttpMCPClient).not.toHaveBeenCalled();
  });
});

function makeNoopMCPClient(name: string): MCPClient {
  const info = {
    name,
    version: "test",
    protocolVersion: "2025-11-25",
    capabilities: {},
  };
  return {
    async initialize() {
      return info;
    },
    serverInfo() {
      return info;
    },
    async listTools() {
      return [];
    },
    async callTool() {
      return { content: [] };
    },
    async listPrompts() {
      return [];
    },
    async getPrompt() {
      return { messages: [] };
    },
    async listResources() {
      return [];
    },
    async readResource() {
      return { contents: [] };
    },
    async close() {},
  };
}
