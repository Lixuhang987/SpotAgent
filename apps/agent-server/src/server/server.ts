import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { homedir } from "node:os";
import type { PlatformBridgeMessage } from "@handagent/core/protocol/PlatformBridgeMessage.ts";
import type { ThreadCommand } from "@handagent/core/protocol/ThreadCommand.ts";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type { MCPClient } from "@handagent/core/mcp/MCPClient.ts";
import type { MCPServerConfig } from "@handagent/core/mcp/MCPConfig.ts";
import type { PlatformAdapter } from "@handagent/core/platform/PlatformAdapter.ts";
import { parseMCPConfig } from "@handagent/core/mcp/MCPConfig.ts";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import { META_TOOL_NAME } from "@handagent/core/tools/MetaToolUseTool.ts";
import { ThreadPersistence } from "../thread/ThreadPersistence.ts";
import { ThreadCommandRouter } from "../thread/ThreadCommandRouter.ts";
import { ThreadNotificationPublisher } from "../thread/ThreadNotificationPublisher.ts";
import { ThreadRuntimeOrchestrator } from "../thread/ThreadRuntimeOrchestrator.ts";
import { FileThreadStore } from "@handagent/core/storage/index.ts";
import {
  WebSocketPlatformBridge,
  type BridgeToken,
} from "../bridges/WebSocketPlatformBridge.ts";
import {
  ThreadPermissionBridge,
  type ThreadBindingToken,
} from "../bridges/ThreadPermissionBridge.ts";
import { ThreadWorkspaceAskBridge } from "../bridges/ThreadWorkspaceAskBridge.ts";
import type { FilePermissionPolicy } from "@handagent/core/permission/FilePermissionPolicy.ts";

type ThreadSocket = {
  send(data: string): void;
  on(event: "message", listener: (raw: { toString(): string }) => void): void;
  on(event: "close", listener: () => void): void;
};

type ThreadSocketMessage = ThreadCommand | ClientResponse;
type PlatformSocketMessage = PlatformBridgeMessage;

let nextConnectionId = 0;

export function attachThreadSocketHandlers(
  socket: ThreadSocket,
  {
    commandRouter,
    eventPublisher,
    permissionBridge,
    permissionPolicy,
    workspaceAskBridge,
  }: {
    commandRouter: ThreadCommandRouter;
    eventPublisher: ThreadNotificationPublisher;
    permissionBridge?: ThreadPermissionBridge;
    permissionPolicy?: FilePermissionPolicy;
    workspaceAskBridge?: ThreadWorkspaceAskBridge;
  },
): void {
  const connectionId = `connection-${++nextConnectionId}`;
  const boundThreads = new Map<string, ThreadBindingToken>();
  const workspaceAskBoundThreads = new Map<string, ThreadBindingToken>();
  const sendPublished = (outgoing: ThreadNotification | ServerRequest) => {
    socket.send(JSON.stringify(outgoing));
  };
  eventPublisher?.attachConnection(connectionId, sendPublished);

  socket.on("message", async (raw) => {
    const message = JSON.parse(raw.toString()) as ThreadSocketMessage;

    if (isClientResponse(message)) {
      if (message.type === "permission.answered" && permissionBridge) {
        const token = boundThreads.get(threadIdFromRequestId(message.requestId));
        if (token !== undefined) {
          permissionBridge.handleResponse(message, token);
        }
        return;
      }
      if (message.type === "workspace.answered" && workspaceAskBridge) {
        const token = workspaceAskBoundThreads.get(threadIdFromRequestId(message.requestId));
        if (token !== undefined) {
          workspaceAskBridge.handleResponse(message, token);
        }
        return;
      }
      commandRouter.handleResponse(message, connectionId);
      return;
    }

    if (isThreadCommand(message)) {
      if ("threadId" in message && typeof message.threadId === "string") {
        eventPublisher.subscribe(connectionId, message.threadId);
      }
      if (message.type === "turn.start") {
        if (permissionBridge && !boundThreads.has(message.threadId)) {
          const token = permissionBridge.bindThread(
            message.threadId,
            (request) => eventPublisher.publishToConnection(connectionId, request),
          );
          boundThreads.set(message.threadId, token);
        }
        if (workspaceAskBridge && !workspaceAskBoundThreads.has(message.threadId)) {
          const token = workspaceAskBridge.bindThread(
            message.threadId,
            (request) => eventPublisher.publishToConnection(connectionId, request),
          );
          workspaceAskBoundThreads.set(message.threadId, token);
        }
      }
      await commandRouter.receive(message, connectionId);
      return;
    }
  });

  socket.on("close", () => {
    eventPublisher.detachConnection(connectionId);
    for (const [threadId, token] of boundThreads) {
      const unbound = permissionBridge?.unbindThread(threadId, token) ?? false;
      if (unbound) {
        commandRouter.interruptThread(threadId);
        clearThreadPermissionRules(permissionPolicy, threadId);
      }
    }
    for (const [threadId, token] of workspaceAskBoundThreads) {
      workspaceAskBridge?.unbindThread(threadId, token);
    }
    boundThreads.clear();
    workspaceAskBoundThreads.clear();
  });
}

export function attachPlatformSocketHandlers(
  socket: ThreadSocket,
  {
    bridge,
  }: {
    bridge?: WebSocketPlatformBridge;
  },
): void {
  let bridgeToken: BridgeToken | null = null;
  const sendPlatform = (outgoing: PlatformBridgeMessage) => {
    socket.send(JSON.stringify(outgoing));
  };

  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString()) as PlatformSocketMessage;
    if (!isPlatformBridgeMessage(message)) {
      return;
    }

    if (message.type === "platform_bridge_hello" && bridge) {
      bridgeToken = bridge.attach(sendPlatform);
    } else if (message.type === "platform_response") {
      bridge?.handleResponse(message.payload, bridgeToken);
    }
  });

  socket.on("close", () => {
    if (bridgeToken !== null && bridge) {
      bridge.detach(bridgeToken);
    }
  });
}

function isPlatformBridgeMessage(message: unknown): message is PlatformBridgeMessage {
  return isRecord(message) && message.channel === "platform";
}

function isThreadCommand(message: ThreadSocketMessage): message is ThreadCommand {
  return [
    "thread.start",
    "thread.resume",
    "thread.list",
    "thread.delete",
    "turn.start",
    "turn.interrupt",
  ].includes((message as { type?: string }).type ?? "");
}

function isClientResponse(message: ThreadSocketMessage): message is ClientResponse {
  return message.type === "permission.answered" || message.type === "workspace.answered";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function threadIdFromRequestId(requestId: string): string {
  const separator = requestId.lastIndexOf(":");
  return separator === -1 ? requestId : requestId.slice(0, separator);
}

export async function startServer({
  commandRouter,
  eventPublisher,
  bridge,
  permissionBridge,
  permissionPolicy,
  workspaceAskBridge,
  port = 4317,
}: {
  commandRouter: ThreadCommandRouter;
  eventPublisher: ThreadNotificationPublisher;
  bridge?: WebSocketPlatformBridge;
  permissionBridge?: ThreadPermissionBridge;
  permissionPolicy?: FilePermissionPolicy;
  workspaceAskBridge?: ThreadWorkspaceAskBridge;
  port?: number;
}) {
  const { WebSocketServer } = await import("ws");
  const wss = new WebSocketServer({ port });

  wss.on("connection", (socket, request) => {
    const path = request.url?.split("?")[0] ?? "/api/thread";
    if (path === "/api/platform") {
      attachPlatformSocketHandlers(socket, { bridge });
      return;
    }

    attachThreadSocketHandlers(socket, {
      commandRouter,
      eventPublisher,
      permissionBridge,
      permissionPolicy,
      workspaceAskBridge,
    });
  });

  return wss;
}

export async function startDefaultServer(port = 4317) {
  const [
    { AgentRuntime },
    { RemotePlatformAdapter },
    { FileWorkspaceRegistry },
    { FilePermissionPolicy },
    { SettingsBackedLLMClient },
    { SettingsBackedToolRegistry },
    { ThreadScopedToolRegistry },
    { ActionBindingResolver },
    { MCPServerRegistry },
    { StdioMCPClient },
    { StreamableHttpMCPClient },
    { ComputerUseMCPClient },
    { FileNetworkLogger },
    { FilesystemBlobStore },
    { TurnSummarizer },
    { MockLLMClient },
  ] = await Promise.all([
    import("@handagent/core/runtime/AgentRuntime.ts"),
    import("@handagent/core/platform/RemotePlatformAdapter.ts"),
    import("@handagent/core/workspace/FileWorkspaceRegistry.ts"),
    import("@handagent/core/permission/FilePermissionPolicy.ts"),
    import("../settings/SettingsBackedLLMClient.ts"),
    import("../settings/SettingsBackedToolRegistry.ts"),
    import("../actions/ThreadScopedToolRegistry.ts"),
    import("../actions/ActionBindingResolver.ts"),
    import("../actions/MCPServerRegistry.ts"),
    import("@handagent/core/mcp/StdioMCPClient.ts"),
    import("@handagent/core/mcp/StreamableHttpMCPClient.ts"),
    import("../actions/ComputerUseMCPClient.ts"),
    import("@handagent/core/logging/FileNetworkLogger.ts"),
    import("@handagent/core/blob/FilesystemBlobStore.ts"),
    import("@handagent/core/runtime/TurnSummarizer.ts"),
    import("@handagent/core/llm/MockLLMClient.ts"),
  ]);

  const paths = resolveServerPaths();
  const store = new FileThreadStore(paths.threadsDir);
  const networkLogger = new FileNetworkLogger({ baseDir: paths.logDir });
  const blobStore = new FilesystemBlobStore({ rootPath: paths.blobsDir });
  const mcpConfig = await readMCPConfig(paths.mcpConfigPath);
  const mcpServers = new Map(mcpConfig.servers.map((server) => [server.id, server]));

  const workspaceRegistry = new FileWorkspaceRegistry({
    filePath: paths.workspacesPath,
    defaultRootPath: paths.defaultWorkspaceDir,
  });
  await workspaceRegistry.getDefault();

  const platformBridge = new WebSocketPlatformBridge();
  const workspaceAskBridge = new ThreadWorkspaceAskBridge();
  const platform = new RemotePlatformAdapter({ bridge: platformBridge });
  const toolRegistry = new SettingsBackedToolRegistry({
    platform,
    workspaceRegistry,
    workspaceAskResolver: workspaceAskBridge.ask,
  });
  await toolRegistry.refresh();
  const llmMode = resolveLLMMode();

  const mcpRegistry = new MCPServerRegistry({
    createClient: (serverId: string) => {
      const config = mcpServers.get(serverId);
      if (!config) {
        throw new Error(`Unknown MCP server: ${serverId}`);
      }
      return createMCPClientFromConfig(config, {
        StdioMCPClient,
        StreamableHttpMCPClient,
        ComputerUseMCPClient,
      }, {
        platform,
      });
    },
  });
  const globalMcpServerIds = [...mcpServers.keys()];
  const threadScopedTools = new ThreadScopedToolRegistry(
    {
      builtinRegistry: toolRegistry.registry,
      globalMcpServerIds,
      listMcpTools: (serverId: string) => mcpRegistry.listTools(serverId),
      exposeBuiltinToolsBeforeActivation: llmMode === "mock",
    },
    {
      log: (message: string) => console.warn(message),
    },
  );

  const permissionBridge = new ThreadPermissionBridge();
  const permissionPolicy = new FilePermissionPolicy({
    filePath: paths.permissionsPath,
    askResolver: permissionBridge.ask,
  });

  const llmClient = llmMode === "mock"
    ? new MockLLMClient()
    : new SettingsBackedLLMClient({ networkLogger });
  const summarizer = llmMode === "mock"
    ? undefined
    : new TurnSummarizer({
        client: new SettingsBackedLLMClient({ networkLogger, purpose: "summarizer" }),
      blobStore,
    });
  console.log(`[agent-server] llm mode: ${llmMode}`);

  const runtimeByThread = new Map<string, InstanceType<typeof AgentRuntime>>();
  const runtimeForThread = (threadId: string) => {
    let runtime = runtimeByThread.get(threadId);
    if (!runtime) {
      runtime = new AgentRuntime(llmClient, threadScopedTools.registryForThread(threadId), {
        permissionPolicy,
        blobStore,
        turnSummarizer: summarizer,
        onMetaToolActivate: async (activeThreadId) => {
          await threadScopedTools.activate(activeThreadId);
        },
        isThreadActivated: (activeThreadId) => threadScopedTools.isActivated(activeThreadId),
      });
      runtimeByThread.set(threadId, runtime);
    }
    return runtime;
  };
  const persistence = new ThreadPersistence(store, undefined, blobStore);
  const orchestrator = new ThreadRuntimeOrchestrator(
    runtimeForThread,
    persistence,
    undefined,
    async (threadId) => {
      await toolRegistry.refresh();
      const thread = await persistence.getThread(threadId);
      const binding = thread?.metadata.actionBinding;

      if (!threadScopedTools.isActivated(threadId)) {
        if (binding) {
          await threadScopedTools.activate(threadId);
        } else {
          const history = await persistence.getMessages(threadId);
          if (historyShowsToolsActivated(history)) {
            await threadScopedTools.activate(threadId);
          }
        }
      }

      await threadScopedTools.refreshForThread(threadId, binding);
    },
  );
  const eventPublisher = new ThreadNotificationPublisher();
  const commandRouter = new ThreadCommandRouter(
    orchestrator,
    persistence,
    eventPublisher,
    undefined,
    new ActionBindingResolver({ pluginsDir: paths.pluginsDir }),
    (threadId) => {
      threadScopedTools.forgetThread(threadId);
      runtimeByThread.delete(threadId);
    },
  );

  return startServer({
    commandRouter,
    eventPublisher,
    bridge: platformBridge,
    permissionBridge,
    permissionPolicy,
    workspaceAskBridge,
    port,
  });
}

interface ServerPaths {
  spotDir: string;
  threadsDir: string;
  logDir: string;
  blobsDir: string;
  pluginsDir: string;
  workspacesPath: string;
  defaultWorkspaceDir: string;
  mcpConfigPath: string;
  permissionsPath: string;
}

function resolveServerPaths(): ServerPaths {
  const spotDir = join(homedir(), ".spotAgent");
  return {
    spotDir,
    threadsDir: join(spotDir, "threads"),
    logDir: join(spotDir, "log"),
    blobsDir: join(spotDir, "blobs"),
    pluginsDir: join(spotDir, "plugins"),
    workspacesPath: join(spotDir, "workspaces.json"),
    defaultWorkspaceDir: join(spotDir, "workspace"),
    mcpConfigPath: join(spotDir, "mcp.json"),
    permissionsPath: join(spotDir, "permissions.json"),
  };
}

export type LLMMode = "settings" | "mock";

export async function readMCPConfig(filePath: string) {
  try {
    return parseMCPConfig(JSON.parse(await readFile(filePath, "utf8")));
  } catch (error) {
    if (isNotFoundError(error)) {
      return { version: 1 as const, servers: [] };
    }
    throw error;
  }
}

export function createMCPClientFromConfig(
  config: MCPServerConfig,
  clients: {
    StdioMCPClient: new (config: Extract<MCPServerConfig, { transport: "stdio" }>) => MCPClient;
    StreamableHttpMCPClient: new (
      config: Extract<MCPServerConfig, { transport: "streamableHttp" }>,
    ) => MCPClient;
    ComputerUseMCPClient?: new (options: {
      serverId: string;
      platform: PlatformAdapter;
    }) => MCPClient;
  },
  dependencies?: {
    platform?: PlatformAdapter;
  },
): MCPClient {
  if (
    isComputerUseServer(config) &&
    clients.ComputerUseMCPClient &&
    dependencies?.platform
  ) {
    return new clients.ComputerUseMCPClient({
      serverId: config.id,
      platform: dependencies.platform,
    });
  }

  return config.transport === "stdio"
    ? new clients.StdioMCPClient(config)
    : new clients.StreamableHttpMCPClient(config);
}

function isComputerUseServer(config: MCPServerConfig): boolean {
  return config.id === "computer_use" || config.id === "computer-use";
}

export function resolveLLMMode(env: Record<string, string | undefined> = process.env): LLMMode {
  return env.HANDAGENT_LLM_MODE === "mock" ? "mock" : "settings";
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function historyShowsToolsActivated(messages: readonly AgentMessage[]): boolean {
  return messages.some((m) => m.role === "tool" && m.name === META_TOOL_NAME);
}

function maybeUnbindThreadOwner(
  threadId: string,
  boundThreads: Map<string, ThreadBindingToken>,
  workspaceAskBoundThreads: Map<string, ThreadBindingToken>,
  permissionBridge: ThreadPermissionBridge | undefined,
  permissionPolicy: FilePermissionPolicy | undefined,
  workspaceAskBridge: ThreadWorkspaceAskBridge | undefined,
  commandRouter: ThreadCommandRouter,
  _connectionId: string,
): void {
  const permissionToken = boundThreads.get(threadId);
  if (permissionToken !== undefined) {
    const unbound = permissionBridge?.unbindThread(threadId, permissionToken) ?? false;
    if (unbound) {
      commandRouter.interruptThread(threadId);
      clearThreadPermissionRules(permissionPolicy, threadId);
    }
    boundThreads.delete(threadId);
  }

  const workspaceToken = workspaceAskBoundThreads.get(threadId);
  if (workspaceToken !== undefined) {
    workspaceAskBridge?.unbindThread(threadId, workspaceToken);
    workspaceAskBoundThreads.delete(threadId);
  }
}

function clearThreadPermissionRules(
  permissionPolicy: FilePermissionPolicy | undefined,
  threadId: string,
): void {
  permissionPolicy?.clearThreadRules(threadId);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdin.resume();
  process.stdin.on("end", () => process.exit(0));
  await startDefaultServer();
}
