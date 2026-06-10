import { EventEmitter, once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent } from "@handagent/core/runtime/AgentRuntime.ts";
import type { PlatformBridgeMessage } from "@handagent/core/protocol/PlatformBridgeMessage.ts";
import type { ThreadCommand } from "@handagent/core/protocol/ThreadCommand.ts";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type { AgentActivityEvent } from "@handagent/core/protocol/AgentActivity.ts";
import type { FilePermissionPolicy } from "@handagent/core/permission/FilePermissionPolicy.ts";
import type { MCPClient } from "@handagent/core/mcp/MCPClient.ts";
import { InMemoryThreadStore } from "@handagent/core/storage/index.ts";
import { ThreadPermissionBridge } from "../../src/bridges/ThreadPermissionBridge.ts";
import { AgentActivityPublisher } from "../../src/activity/AgentActivityPublisher.ts";
import {
  AgentManager,
  createSharedAgentStatus,
  renderUserInputForRuntime,
} from "../../src/agent/AgentManager.ts";
import { ThreadPersistence } from "../../src/thread/ThreadPersistence.ts";
import { ThreadRuntimeOrchestrator } from "../../src/thread/ThreadRuntimeOrchestrator.ts";
import { ThreadCommandRouter } from "../../src/thread/ThreadCommandRouter.ts";
import { ThreadNotificationPublisher } from "../../src/thread/ThreadNotificationPublisher.ts";
import { ThreadWorkspaceAskBridge } from "../../src/bridges/ThreadWorkspaceAskBridge.ts";
import {
  attachActivitySocketHandlers,
  attachPlatformSocketHandlers,
  attachThreadSocketHandlers,
  createMCPClientFromConfig,
  resolveLLMMode,
  startServer,
} from "../../src/server/server.ts";

class FakeSocket extends EventEmitter {
  sent: string[] = [];

  send(raw: string): void {
    this.sent.push(raw);
  }
}

function opSubmit(threadId: string, text: string): ThreadCommand {
  return {
    type: "op.submit",
    threadId,
    commandId: `command-${threadId}-${text}`,
    timestamp: new Date().toISOString(),
    payload: {
      op: {
        type: "user_input",
        opId: `message-${threadId}-${text}`,
        timestamp: new Date().toISOString(),
        payload: {
          items: [{ type: "text", id: `item-${threadId}-${text}`, text }],
        },
      },
    },
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

async function emitRawMessage(socket: FakeSocket, raw: string): Promise<void> {
  socket.emit("message", Buffer.from(raw));
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

async function waitForClose(socket: WebSocket, timeoutMs = 250): Promise<boolean> {
  const close = once(socket, "close").then(() => true);
  const timeout = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), timeoutMs);
  });
  return Promise.race([close, timeout]);
}

describe("attachThreadSocketHandlers", () => {
  it("binds every op.submit thread on a socket and clears them all on close", async () => {
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

    await emitMessage(socket, opSubmit("Thread-A", "first"));
    await emitMessage(socket, opSubmit("Thread-B", "second"));

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

    await emitMessage(socket, opSubmit("Thread-A", "first"));
    socket.emit("close");

    expect(permissionBridge.unbindThread).toHaveBeenCalledWith("Thread-A", 101);
    expect(commandRouter.interruptThread).not.toHaveBeenCalled();
    expect(permissionPolicy.clearThreadRules).not.toHaveBeenCalled();
  });

  it("migrates pending permission asks to the rebound socket", async () => {
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

    await emitMessage(firstSocket, opSubmit("Thread-A", "first"));
    const staleAsk = permissionBridge.ask({
      threadId: "Thread-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });
    const staleRequest = lastSent<ServerRequest>(firstSocket);
    if (staleRequest.type !== "permission.requested") throw new Error("type");

    await emitMessage(secondSocket, opSubmit("Thread-A", "reconnect"));
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
    expect(permissionPolicy.clearThreadRules).not.toHaveBeenCalled();
    expect(firstDeps.commandRouter.interruptThread).not.toHaveBeenCalled();
    await emitMessage(
      secondSocket,
      permissionResponse(staleRequest.requestId, "allow"),
    );
    await expect(staleAsk).resolves.toEqual({ decision: "allow", remember: "thread" });

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

  it("keeps the same binding token for repeated op.submit commands on one socket", async () => {
    const socket = new FakeSocket();
    const deps = makeHandlerDependencies();
    const permissionBridge = new ThreadPermissionBridge();

    attachThreadSocketHandlers(socket as never, {
      ...deps,
      permissionBridge,
    });

    await emitMessage(socket, opSubmit("Thread-A", "first"));
    const ask = permissionBridge.ask({
      threadId: "Thread-A",
      toolName: "file.write",
      toolCallId: "tool-A",
      arguments: { path: "a.txt" },
    });
    const request = lastSent<ServerRequest>(socket);
    if (request.type !== "permission.requested") throw new Error("type");

    await emitMessage(socket, opSubmit("Thread-A", "second"));
    await emitMessage(socket, permissionResponse(request.requestId, "allow"));

    await expect(ask).resolves.toEqual({ decision: "allow", remember: "thread" });
  });

  it("replays a pending permission request after thread.resume binds a reconnected socket", async () => {
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    const firstDeps = makeHandlerDependencies();
    const secondDeps = makeHandlerDependencies();
    const permissionBridge = new ThreadPermissionBridge();

    attachThreadSocketHandlers(firstSocket as never, {
      ...firstDeps,
      permissionBridge,
    });
    attachThreadSocketHandlers(secondSocket as never, {
      ...secondDeps,
      permissionBridge,
    });

    await emitMessage(firstSocket, opSubmit("Thread-A", "first"));
    const ask = permissionBridge.ask({
      threadId: "Thread-A",
      toolName: "ocr.read",
      toolCallId: "tool-A",
      arguments: { imageBase64: "stub", mimeType: "image/png" },
    });
    const request = lastSent<ServerRequest>(firstSocket);
    if (request.type !== "permission.requested") throw new Error("type");

    await emitMessage(secondSocket, {
      type: "thread.resume",
      threadId: "Thread-A",
      commandId: "resume-1",
      timestamp: new Date().toISOString(),
    });

    expect(secondDeps.commandRouter.receive).toHaveBeenCalledWith(
      expect.objectContaining({ type: "thread.resume", threadId: "Thread-A" }),
      expect.any(String),
    );
    expect(lastSent<ServerRequest>(secondSocket)).toEqual(request);

    await emitMessage(secondSocket, permissionResponse(request.requestId, "deny"));

    await expect(ask).resolves.toEqual({ decision: "deny", remember: "thread" });
  });

  it("routes workspace request responses through the current socket binding", async () => {
    const socket = new FakeSocket();
    const deps = makeHandlerDependencies();
    const workspaceAskBridge = new ThreadWorkspaceAskBridge();

    attachThreadSocketHandlers(socket as never, {
      ...deps,
      workspaceAskBridge,
    });

    await emitMessage(socket, opSubmit("Thread-A", "first"));
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

    await emitMessage(socket, opSubmit("workspace:Thread-A", "first"));
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
    const manager = new AgentManager();
    manager.register("Thread-A", {
      tx_sub: {
        async send(op) {
          if (op.type === "interrupt") {
            await orchestrator.interruptAndWait("Thread-A", (event) => {
              eventPublisher.publish(event);
            });
            return;
          }

          await orchestrator.submitInput(
            {
              threadId: "Thread-A",
              messageId: op.opId,
              timestamp: op.timestamp,
              payload: renderUserInputForRuntime(op),
            },
            (event) => {
              eventPublisher.publish(event);
            },
          );
        },
      },
      rx_event: (async function* emptyRuntimeEventStream() {})(),
      agent_status: createSharedAgentStatus(),
      session: { threadId: "Thread-A" },
      async close() {
        await orchestrator.interruptAndWait("Thread-A", (event) => {
          eventPublisher.publish(event);
        });
      },
    });
    const commandRouter = new ThreadCommandRouter(
      manager,
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

    await emitMessage(socket, opSubmit("Thread-A", "close me"));
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

  it("ignores non-object and malformed thread socket frames", async () => {
    const socket = new FakeSocket();
    const { commandRouter, eventPublisher } = makeHandlerDependencies();

    attachThreadSocketHandlers(socket as never, {
      commandRouter,
      eventPublisher,
    });

    await emitRawMessage(socket, "null");
    await emitRawMessage(socket, '"thread.start"');
    await emitRawMessage(socket, "true");
    await emitRawMessage(socket, "{not json");

    expect(commandRouter.receive).not.toHaveBeenCalled();
    expect(commandRouter.handleResponse).not.toHaveBeenCalled();

    await emitMessage(socket, opSubmit("Thread-A", "after bad frames"));

    expect(commandRouter.receive).toHaveBeenCalledTimes(1);
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

  it("treats duplicate hello on the same platform socket as idempotent", async () => {
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
    await emitMessage(socket, platformHello("bridge-1-retry"));
    socket.emit("close");

    expect(bridge.attach).toHaveBeenCalledTimes(1);
    expect(bridge.detach).toHaveBeenCalledWith(501);
  });

  it("ignores non-platform and malformed platform socket frames", async () => {
    const socket = new FakeSocket();
    const bridge = {
      attach: vi.fn().mockReturnValue(501),
      detach: vi.fn(),
      handleResponse: vi.fn(),
    };

    attachPlatformSocketHandlers(socket as never, {
      bridge: bridge as never,
    });

    await emitRawMessage(socket, "null");
    await emitRawMessage(socket, '"platform_bridge_hello"');
    await emitRawMessage(socket, JSON.stringify({ type: "platform_bridge_hello" }));
    await emitRawMessage(socket, "{not json");

    expect(bridge.attach).not.toHaveBeenCalled();
    expect(bridge.handleResponse).not.toHaveBeenCalled();

    await emitMessage(socket, platformHello("bridge-1"));

    expect(bridge.attach).toHaveBeenCalledTimes(1);
  });
});

describe("attachActivitySocketHandlers", () => {
  it("sends a snapshot on activity socket attach and removes subscriber on close", () => {
    const socket = new FakeSocket();
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");

    attachActivitySocketHandlers(socket as never, { activityPublisher: publisher });

    expect(lastSent<AgentActivityEvent>(socket)).toEqual({
      channel: "activity",
      type: "activity.snapshot",
      activeThreadId: null,
      status: "idle",
      latestSummary: null,
      waitingRequest: null,
      error: null,
      updatedAt: "2026-06-08T00:00:00.000Z",
    });

    socket.emit("close");
    publisher.observe({
      type: "turn.started",
      threadId: "thread-1",
      notificationId: "n1",
      turnId: "turn-1",
      timestamp: "2026-06-08T00:00:00.000Z",
      payload: {},
    });

    expect(socket.sent).toHaveLength(1);
  });
});

describe("startServer", () => {
  it.each(["/api/unknown", "/"])(
    "closes sockets on %s without attaching thread or platform handlers",
    async (path) => {
      const commandRouter = {
        receive: vi.fn(async () => {}),
        interruptThread: vi.fn(),
        handleResponse: vi.fn(),
      } as unknown as ThreadCommandRouter;
      const eventPublisher = {
        attachConnection: vi.fn(),
        detachConnection: vi.fn(),
        subscribe: vi.fn(),
        publishToConnection: vi.fn(),
      } as unknown as ThreadNotificationPublisher;
      const bridge = {
        attach: vi.fn(),
        detach: vi.fn(),
        handleResponse: vi.fn(),
      };
      const server = await startServer({
        commandRouter,
        eventPublisher,
        bridge: bridge as never,
        port: 0,
      });
      const address = server.address() as AddressInfo;
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}${path}`);

      try {
        const outcome = await new Promise<"open" | "error">((resolve) => {
          socket.once("open", () => resolve("open"));
          socket.once("error", () => resolve("error"));
        });

        expect(outcome).toBe("error");
        expect(eventPublisher.attachConnection).not.toHaveBeenCalled();
        expect(commandRouter.receive).not.toHaveBeenCalled();
        expect(bridge.attach).not.toHaveBeenCalled();
      } finally {
        if (
          socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING
        ) {
          socket.terminate();
        }
        server.close();
        await once(server, "close");
      }
    },
  );

  it("serves thread-window static assets over HTTP on the same port", async () => {
    const staticDir = await mkdtemp(join(tmpdir(), "handagent-thread-window-web-"));
    await writeFile(
      join(staticDir, "index.html"),
      "<!doctype html><html><body>thread-window</body></html>",
    );
    await writeFile(join(staticDir, "app.js"), "console.log('ok');");

    const commandRouter = {
      receive: vi.fn(async () => {}),
      interruptThread: vi.fn(),
      handleResponse: vi.fn(),
    } as unknown as ThreadCommandRouter;
    const eventPublisher = {
      attachConnection: vi.fn(),
      detachConnection: vi.fn(),
      subscribe: vi.fn(),
      publishToConnection: vi.fn(),
    } as unknown as ThreadNotificationPublisher;
    const server = await startServer({
      commandRouter,
      eventPublisher,
      staticFilesDir: staticDir,
      port: 0,
    });
    const address = server.address() as AddressInfo;

    try {
      const indexResponse = await fetch(`http://127.0.0.1:${address.port}/thread-window/index.html`);
      expect(indexResponse.status).toBe(200);
      expect(indexResponse.headers.get("content-type")).toContain("text/html");
      expect(await indexResponse.text()).toContain("thread-window");

      const assetResponse = await fetch(`http://127.0.0.1:${address.port}/thread-window/app.js`);
      expect(assetResponse.status).toBe(200);
      expect(assetResponse.headers.get("content-type")).toContain("text/javascript");
      expect(await assetResponse.text()).toContain("console.log");

      const missingResponse = await fetch(`http://127.0.0.1:${address.port}/thread-window/missing.js`);
      expect(missingResponse.status).toBe(404);
    } finally {
      server.close();
      await once(server, "close");
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  it("routes /api/activity websocket clients to the activity publisher", async () => {
    const activityPublisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    const server = await startServer({
      ...makeHandlerDependencies(),
      activityPublisher,
      port: 0,
    });
    const address = server.address() as AddressInfo;
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/activity`);

    try {
      const [raw] = await once(socket, "message");
      const snapshot = JSON.parse(raw.toString()) as AgentActivityEvent;
      expect(snapshot.type).toBe("activity.snapshot");
    } finally {
      socket.close();
      server.close();
      await once(server, "close");
    }
  });

  it("closes /api/activity clients when no activity publisher is configured", async () => {
    const commandRouter = {
      receive: vi.fn(async () => {}),
      interruptThread: vi.fn(),
      handleResponse: vi.fn(),
    } as unknown as ThreadCommandRouter;
    const eventPublisher = {
      attachConnection: vi.fn(),
      detachConnection: vi.fn(),
      subscribe: vi.fn(),
      publishToConnection: vi.fn(),
    } as unknown as ThreadNotificationPublisher;
    const bridge = {
      attach: vi.fn(),
      detach: vi.fn(),
      handleResponse: vi.fn(),
    };
    const server = await startServer({
      commandRouter,
      eventPublisher,
      bridge: bridge as never,
      port: 0,
    });
    const address = server.address() as AddressInfo;
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/activity`);

    try {
      const opened = await new Promise<boolean>((resolve) => {
        socket.once("open", () => resolve(true));
        socket.once("error", () => resolve(false));
      });
      expect(opened).toBe(true);
      await expect(waitForClose(socket)).resolves.toBe(true);
      expect(eventPublisher.attachConnection).not.toHaveBeenCalled();
      expect(commandRouter.receive).not.toHaveBeenCalled();
      expect(bridge.attach).not.toHaveBeenCalled();
    } finally {
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.terminate();
      }
      server.close();
      await once(server, "close");
    }
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
