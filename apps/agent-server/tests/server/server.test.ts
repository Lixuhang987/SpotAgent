import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent } from "@handagent/core/runtime/AgentRuntime.ts";
import type { PlatformBridgeMessage } from "@handagent/core/protocol/PlatformBridgeMessage.ts";
import type { ThreadCommand } from "@handagent/core/protocol/ThreadCommand.ts";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type { FilePermissionPolicy } from "@handagent/core/permission/FilePermissionPolicy.ts";
import type { MCPClient } from "@handagent/core/mcp/MCPClient.ts";
import { InMemoryThreadStore } from "@handagent/core/storage/index.ts";
import { ThreadPermissionBridge } from "../../src/bridges/ThreadPermissionBridge.ts";
import { ThreadPersistence } from "../../src/thread/ThreadPersistence.ts";
import { ThreadRuntimeOrchestrator } from "../../src/thread/ThreadRuntimeOrchestrator.ts";
import { ThreadCommandRouter } from "../../src/thread/ThreadCommandRouter.ts";
import { ThreadNotificationPublisher } from "../../src/thread/ThreadNotificationPublisher.ts";
import { ThreadWorkspaceAskBridge } from "../../src/bridges/ThreadWorkspaceAskBridge.ts";
import {
  attachPlatformSocketHandlers,
  attachThreadSocketHandlers,
  createMCPClientFromConfig,
  resolveLLMMode,
} from "../../src/server/server.ts";

class FakeSocket extends EventEmitter {
  sent: string[] = [];

  send(raw: string): void {
    this.sent.push(raw);
  }
}

function turnStart(threadId: string, text: string): ThreadCommand {
  return {
    type: "turn.start",
    threadId,
    commandId: `message-${threadId}-${text}`,
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
    type: "permission.answered",
    requestId,
    timestamp: new Date().toISOString(),
    payload: { decision, scope: "thread" },
  };
}

function workspaceAskResponse(requestId: string, workspaceId: string): ClientResponse {
  return {
    type: "workspace.answered",
    requestId,
    timestamp: new Date().toISOString(),
    payload: { workspaceId },
  };
}

async function emitMessage(
  socket: FakeSocket,
  message: ThreadCommand | ClientResponse | PlatformBridgeMessage,
): Promise<void> {
  socket.emit("message", Buffer.from(JSON.stringify(message)));
  await Promise.resolve();
}

function makeHandlerDependencies(options: {
  commandRouter?: Partial<ThreadCommandRouter>;
  eventPublisher?: ThreadNotificationPublisher;
} = {}) {
  return {
    commandRouter: {
      receive: vi.fn(async () => {}),
      interruptThread: vi.fn(),
      handleResponse: vi.fn(),
      ...options.commandRouter,
    } as unknown as ThreadCommandRouter,
    eventPublisher: options.eventPublisher ?? new ThreadNotificationPublisher(),
  };
}

function lastSent<T>(socket: FakeSocket): T {
  return JSON.parse(socket.sent.at(-1) ?? "null") as T;
}

describe("attachThreadSocketHandlers", () => {
  it("binds every turn.start thread on a socket and clears them all on close", async () => {
    const socket = new FakeSocket();
    const { commandRouter, eventPublisher } = makeHandlerDependencies();
    const permissionBridge = {
      bindThread: vi.fn().mockReturnValueOnce(101).mockReturnValueOnce(102),
      unbindThread: vi.fn().mockReturnValue(true),
    } as unknown as ThreadPermissionBridge;
    const permissionPolicy = {
      clearThreadRules: vi.fn(),
    } as unknown as FilePermissionPolicy;

    attachThreadSocketHandlers(socket as never, {
      commandRouter,
      eventPublisher,
      permissionBridge,
      permissionPolicy,
    });

    await emitMessage(socket, turnStart("Thread-A", "first"));
    await emitMessage(socket, turnStart("Thread-B", "second"));

    expect(permissionBridge.bindThread).toHaveBeenCalledWith(
      "Thread-A",
      expect.any(Function),
    );
    expect(permissionBridge.bindThread).toHaveBeenCalledWith(
      "Thread-B",
      expect.any(Function),
    );

    socket.emit("close");

    expect(permissionBridge.unbindThread).toHaveBeenCalledWith("Thread-A", 101);
    expect(permissionBridge.unbindThread).toHaveBeenCalledWith("Thread-B", 102);
    expect(commandRouter.interruptThread).toHaveBeenCalledWith("Thread-A");
    expect(commandRouter.interruptThread).toHaveBeenCalledWith("Thread-B");
    expect(permissionPolicy.clearThreadRules).toHaveBeenCalledWith("Thread-A");
    expect(permissionPolicy.clearThreadRules).toHaveBeenCalledWith("Thread-B");
  });

  it("does not clear a thread binding or thread rules when a stale socket closes after reconnect", async () => {
    const socket = new FakeSocket();
    const { commandRouter, eventPublisher } = makeHandlerDependencies();
    const permissionBridge = {
      bindThread: vi.fn().mockReturnValue(101),
      unbindThread: vi.fn().mockReturnValue(false),
    } as unknown as ThreadPermissionBridge;
    const permissionPolicy = {
      clearThreadRules: vi.fn(),
    } as unknown as FilePermissionPolicy;

    attachThreadSocketHandlers(socket as never, {
      commandRouter,
      eventPublisher,
      permissionBridge,
      permissionPolicy,
    });

    await emitMessage(socket, turnStart("Thread-A", "first"));
    socket.emit("close");

    expect(permissionBridge.unbindThread).toHaveBeenCalledWith("Thread-A", 101);
    expect(commandRouter.interruptThread).not.toHaveBeenCalled();
    expect(permissionPolicy.clearThreadRules).not.toHaveBeenCalled();
  });

  it("ignores stale permission responses and only closes pending asks owned by the stale socket", async () => {
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    const firstDeps = makeHandlerDependencies();
    const secondDeps = makeHandlerDependencies();
    const permissionBridge = new ThreadPermissionBridge();
    const permissionPolicy = {
      clearThreadRules: vi.fn(),
    } as unknown as FilePermissionPolicy;

    attachThreadSocketHandlers(firstSocket as never, {
      ...firstDeps,
      permissionBridge,
      permissionPolicy,
    });
    attachThreadSocketHandlers(secondSocket as never, {
      ...secondDeps,
      permissionBridge,
      permissionPolicy,
    });

    await emitMessage(firstSocket, turnStart("Thread-A", "first"));
    const staleAsk = permissionBridge.ask({
      threadId: "Thread-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });
    const staleRequest = lastSent<ServerRequest>(firstSocket);
    if (staleRequest.type !== "permission.requested") throw new Error("type");

    await emitMessage(secondSocket, turnStart("Thread-A", "reconnect"));
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
      reason: "thread closed",
    });
    expect(permissionPolicy.clearThreadRules).not.toHaveBeenCalled();
    expect(firstDeps.commandRouter.interruptThread).not.toHaveBeenCalled();

    const currentAsk = permissionBridge.ask({
      threadId: "Thread-A",
      toolName: "file.write",
      toolCallId: "tool-B",
      arguments: { path: "b.txt" },
    });
    const currentRequest = lastSent<ServerRequest>(secondSocket);
    if (currentRequest.type !== "permission.requested") throw new Error("type");
    await emitMessage(
      secondSocket,
      permissionResponse(currentRequest.requestId, "allow"),
    );

    await expect(currentAsk).resolves.toEqual({ decision: "allow", remember: "thread" });
  });

  it("keeps the same binding token for repeated turn.start commands on one socket", async () => {
    const socket = new FakeSocket();
    const deps = makeHandlerDependencies();
    const permissionBridge = new ThreadPermissionBridge();

    attachThreadSocketHandlers(socket as never, {
      ...deps,
      permissionBridge,
    });

    await emitMessage(socket, turnStart("Thread-A", "first"));
    const ask = permissionBridge.ask({
      threadId: "Thread-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });
    const request = lastSent<ServerRequest>(socket);
    if (request.type !== "permission.requested") throw new Error("type");

    await emitMessage(socket, turnStart("Thread-A", "second"));
    await emitMessage(socket, permissionResponse(request.requestId, "allow"));

    await expect(ask).resolves.toEqual({ decision: "allow", remember: "thread" });
  });

  it("routes workspace request responses through the current socket binding", async () => {
    const socket = new FakeSocket();
    const deps = makeHandlerDependencies();
    const workspaceAskBridge = new ThreadWorkspaceAskBridge();

    attachThreadSocketHandlers(socket as never, {
      ...deps,
      workspaceAskBridge,
    });

    await emitMessage(socket, turnStart("Thread-A", "first"));
    const ask = workspaceAskBridge.ask({
      threadId: "Thread-A",
      toolCallId: "tool-1",
      prompt: "请选择 workspace",
      candidates: [
        { id: "docs", name: "文档", description: "文档", isDefault: false },
        { id: "code", name: "代码", description: "代码", isDefault: false },
      ],
    });
    const request = lastSent<ServerRequest>(socket);
    if (request.type !== "workspace.requested") throw new Error("type");

    await emitMessage(socket, workspaceAskResponse(request.requestId, "docs"));

    await expect(ask).resolves.toEqual({ workspaceId: "docs" });
  });

  it("routes permission responses for thread ids that contain colons", async () => {
    const socket = new FakeSocket();
    const deps = makeHandlerDependencies();
    const permissionBridge = new ThreadPermissionBridge();

    attachThreadSocketHandlers(socket as never, {
      ...deps,
      permissionBridge,
    });

    await emitMessage(socket, turnStart("workspace:Thread-A", "first"));
    const ask = permissionBridge.ask({
      threadId: "workspace:Thread-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });
    const request = lastSent<ServerRequest>(socket);
    if (request.type !== "permission.requested") throw new Error("type");

    await emitMessage(socket, permissionResponse(request.requestId, "allow"));

    await expect(ask).resolves.toEqual({ decision: "allow", remember: "thread" });
  });

  it("interrupts the active run owned by a socket when that socket closes", async () => {
    const socket = new FakeSocket();
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-20T00:00:00.000Z",
    );
    let runtimeSignal: AbortSignal | undefined;
    let finishRun: ((result: { messages: AgentMessage[] }) => void) | undefined;
    const runStarted = Promise.withResolvers<void>();
    const orchestrator = new ThreadRuntimeOrchestrator(
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
    const eventPublisher = new ThreadNotificationPublisher();
    const commandRouter = new ThreadCommandRouter(
      orchestrator,
      persistence,
      eventPublisher,
      () => "2026-05-20T00:00:00.000Z",
    );
    const permissionBridge = new ThreadPermissionBridge();

    await persistence.ensureThread("Thread-A");
    attachThreadSocketHandlers(socket as never, {
      commandRouter,
      eventPublisher,
      permissionBridge,
    });

    await emitMessage(socket, turnStart("Thread-A", "close me"));
    await runStarted.promise;

    socket.emit("close");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runtimeSignal?.aborted).toBe(true);
    expect(orchestrator.isThreadRunning("Thread-A")).toBe(false);
    expect(await persistence.getMessages("Thread-A")).toEqual([
      { role: "user", content: "close me" },
    ]);
  });

  it("ignores platform bridge messages on the thread socket", async () => {
    const socket = new FakeSocket();
    const { commandRouter, eventPublisher } = makeHandlerDependencies();

    attachThreadSocketHandlers(socket as never, {
      commandRouter,
      eventPublisher,
    });

    await emitMessage(socket, platformHello("bridge-1"));
    socket.emit("close");

    expect(commandRouter.receive).not.toHaveBeenCalled();
    expect(socket.sent).toEqual([]);
  });

  it("detaches platform sockets without interrupting thread runs", async () => {
    const socket = new FakeSocket();
    const bridge = {
      attach: vi.fn().mockReturnValue(501),
      detach: vi.fn(),
      handleResponse: vi.fn(),
    };

    attachPlatformSocketHandlers(socket as never, {
      bridge: bridge as never,
    });

    await emitMessage(socket, platformHello("bridge-1"));
    socket.emit("close");

    expect(bridge.attach).toHaveBeenCalledWith(expect.any(Function));
    expect(bridge.detach).toHaveBeenCalledWith(501);
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
