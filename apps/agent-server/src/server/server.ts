import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { extname, join, resolve } from "node:path";
import { homedir } from "node:os";
import type { PlatformBridgeMessage } from "@handagent/core/protocol/PlatformBridgeMessage.ts";
import type { ThreadCommand } from "@handagent/core/protocol/ThreadCommand.ts";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type { AgentActivityEvent } from "@handagent/core/protocol/AgentActivity.ts";
import type { MCPClient } from "@handagent/core/mcp/MCPClient.ts";
import type { MCPServerConfig } from "@handagent/core/mcp/MCPConfig.ts";
import type { PlatformAdapter } from "@handagent/core/platform/PlatformAdapter.ts";
import { parseMCPConfig } from "@handagent/core/mcp/MCPConfig.ts";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import { META_TOOL_NAME } from "@handagent/core/tools/MetaToolUseTool.ts";
import { ThreadPersistence } from "../thread/ThreadPersistence.ts";
import { AgentActivityPublisher } from "../activity/AgentActivityPublisher.ts";
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
    const message = parseSocketMessage(raw);

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
      if (message.type === "input.submit") {
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
        void Promise.resolve(commandRouter.interruptThread(threadId)).catch(() => {});
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
    const message = parseSocketMessage(raw);
    if (!isPlatformBridgeMessage(message)) {
      return;
    }

    if (message.type === "platform_bridge_hello" && bridge) {
      bridgeToken ??= bridge.attach(sendPlatform);
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

export function attachActivitySocketHandlers(
  socket: ThreadSocket,
  {
    activityPublisher,
  }: {
    activityPublisher: AgentActivityPublisher;
  },
): void {
  const connectionId = `activity-${++nextConnectionId}`;
  const sendActivity = (outgoing: AgentActivityEvent) => {
    socket.send(JSON.stringify(outgoing));
  };

  activityPublisher.attachConnection(connectionId, sendActivity);

  socket.on("close", () => {
    activityPublisher.detachConnection(connectionId);
  });
}

function isPlatformBridgeMessage(message: unknown): message is PlatformBridgeMessage {
  return isRecord(message) && message.channel === "platform";
}

function isThreadCommand(message: unknown): message is ThreadCommand {
  if (!isRecord(message)) {
    return false;
  }
  return [
    "thread.start",
    "thread.resume",
    "thread.list",
    "thread.delete",
    "input.submit",
    "turn.interrupt",
    "workspace.list",
  ].includes((message as { type?: string }).type ?? "");
}

function isClientResponse(message: unknown): message is ClientResponse {
  if (!isRecord(message)) {
    return false;
  }
  return message.type === "permission.answered" || message.type === "workspace.answered";
}

function parseSocketMessage(raw: { toString(): string }): unknown {
  try {
    return JSON.parse(raw.toString()) as unknown;
  } catch {
    return undefined;
  }
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
  activityPublisher,
  bridge,
  permissionBridge,
  permissionPolicy,
  workspaceAskBridge,
  staticFilesDir,
  port = 4317,
}: {
  commandRouter: ThreadCommandRouter;
  eventPublisher: ThreadNotificationPublisher;
  activityPublisher?: AgentActivityPublisher;
  bridge?: WebSocketPlatformBridge;
  permissionBridge?: ThreadPermissionBridge;
  permissionPolicy?: FilePermissionPolicy;
  workspaceAskBridge?: ThreadWorkspaceAskBridge;
  staticFilesDir?: string;
  port?: number;
}) {
  const { createServer } = await import("node:http");
  const { WebSocketServer } = await import("ws");
  const threadWebSocketServer = new WebSocketServer({ noServer: true });
  const platformWebSocketServer = new WebSocketServer({ noServer: true });
  const activityWebSocketServer = new WebSocketServer({ noServer: true });
  const server = createServer((request, response) => {
    void handleStaticRequest(request.url ?? "/", response, staticFilesDir);
  });

  threadWebSocketServer.on("connection", (socket, request) => {
    attachThreadSocketHandlers(socket, {
      commandRouter,
      eventPublisher,
      permissionBridge,
      permissionPolicy,
      workspaceAskBridge,
    });
  });

  platformWebSocketServer.on("connection", (socket) => {
    attachPlatformSocketHandlers(socket, { bridge });
  });

  activityWebSocketServer.on("connection", (socket) => {
    if (!activityPublisher) {
      socket.close();
      return;
    }
    attachActivitySocketHandlers(socket, { activityPublisher });
  });

  server.on("upgrade", (request, socket, head) => {
    const path = request.url?.split("?")[0];
    if (path === "/api/activity") {
      activityWebSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        activityWebSocketServer.emit("connection", webSocket, request);
      });
      return;
    }

    if (path === "/api/platform") {
      platformWebSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        platformWebSocketServer.emit("connection", webSocket, request);
      });
      return;
    }

    if (path === "/api/thread") {
      threadWebSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        threadWebSocketServer.emit("connection", webSocket, request);
      });
      return;
    }

    socket.destroy();
  });

  await new Promise<void>((resolveStart, rejectStart) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      rejectStart(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveStart();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });

  return server;
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
  const activityPublisher = new AgentActivityPublisher();
  const eventPublisher = new ThreadNotificationPublisher((event) => {
    activityPublisher.observe(event);
  });
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
    {},
    workspaceRegistry,
  );

  return startServer({
    commandRouter,
    eventPublisher,
    activityPublisher,
    bridge: platformBridge,
    permissionBridge,
    permissionPolicy,
    workspaceAskBridge,
    staticFilesDir: resolveThreadWindowWebDistDir(),
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

function resolveThreadWindowWebDistDir(
  env: Record<string, string | undefined> = process.env,
  currentDirectory = process.cwd(),
): string {
  if (env.HANDAGENT_THREAD_WINDOW_WEB_DIST_DIR) {
    return env.HANDAGENT_THREAD_WINDOW_WEB_DIST_DIR;
  }
  return join(currentDirectory, "apps/thread-window-web/dist");
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

const THREAD_WINDOW_HTTP_PREFIX = "/thread-window";

async function handleStaticRequest(
  rawURL: string,
  response: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string | Buffer): void;
  },
  staticFilesDir?: string,
): Promise<void> {
  if (!staticFilesDir) {
    response.statusCode = 404;
    response.end("Not Found");
    return;
  }

  const pathname = new URL(rawURL, "http://127.0.0.1").pathname;
  const relativePath = resolveThreadWindowRequestPath(pathname);
  if (!relativePath) {
    response.statusCode = 404;
    response.end("Not Found");
    return;
  }

  const rootDir = resolve(staticFilesDir);
  const targetPath = resolve(rootDir, relativePath);
  if (targetPath !== rootDir && !targetPath.startsWith(`${rootDir}/`)) {
    response.statusCode = 403;
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(targetPath);
    response.statusCode = 200;
    response.setHeader("Content-Type", mimeTypeForExtension(extname(targetPath)));
    response.end(body);
  } catch (error) {
    if (isNotFoundError(error)) {
      response.statusCode = 404;
      response.end("Not Found");
      return;
    }
    response.statusCode = 500;
    response.end("Internal Server Error");
  }
}

function resolveThreadWindowRequestPath(pathname: string): string | null {
  if (pathname === THREAD_WINDOW_HTTP_PREFIX || pathname === `${THREAD_WINDOW_HTTP_PREFIX}/`) {
    return "index.html";
  }
  if (!pathname.startsWith(`${THREAD_WINDOW_HTTP_PREFIX}/`)) {
    return null;
  }
  const rawRelativePath = pathname.slice(THREAD_WINDOW_HTTP_PREFIX.length + 1);
  if (rawRelativePath.length === 0) {
    return "index.html";
  }
  return decodeURIComponent(rawRelativePath);
}

function mimeTypeForExtension(extension: string): string {
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
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
