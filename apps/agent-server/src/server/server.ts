import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SessionMessage } from "@handagent/core/protocol/SessionMessage.ts";
import type { PlatformBridgeMessage } from "@handagent/core/protocol/PlatformBridgeMessage.ts";
import type { SessionCommand } from "@handagent/core/protocol/SessionCommand.ts";
import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { SessionEvent } from "@handagent/core/protocol/SessionEvent.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type { MCPClient } from "@handagent/core/mcp/MCPClient.ts";
import type { MCPServerConfig } from "@handagent/core/mcp/MCPConfig.ts";
import type { PlatformAdapter } from "@handagent/core/platform/PlatformAdapter.ts";
import { parseMCPConfig } from "@handagent/core/mcp/MCPConfig.ts";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import { META_TOOL_NAME } from "@handagent/core/tools/MetaToolUseTool.ts";
import { SessionPersistence } from "../session/SessionPersistence.ts";
import { SessionRouter } from "../session/SessionRouter.ts";
import { SessionCommandRouter } from "../session/SessionCommandRouter.ts";
import { SessionEventPublisher } from "../session/SessionEventPublisher.ts";
import { SessionRuntimeOrchestrator } from "../session/SessionRuntimeOrchestrator.ts";
import { FileSessionStore } from "@handagent/core/storage/index.ts";
import {
  WebSocketPlatformBridge,
  type BridgeToken,
} from "../bridges/WebSocketPlatformBridge.ts";
import {
  SessionPermissionBridge,
  type SessionBindingToken,
} from "../bridges/SessionPermissionBridge.ts";
import { SessionWorkspaceAskBridge } from "../bridges/SessionWorkspaceAskBridge.ts";
import type { FilePermissionPolicy } from "@handagent/core/permission/FilePermissionPolicy.ts";

type SessionSocket = {
  send(data: string): void;
  on(event: "message", listener: (raw: { toString(): string }) => void): void;
  on(event: "close", listener: () => void): void;
};

type SocketMessage =
  | SessionMessage
  | PlatformBridgeMessage
  | SessionCommand
  | ClientResponse;

let nextConnectionId = 0;

export function attachSessionSocketHandlers(
  socket: SessionSocket,
  {
    router,
    commandRouter,
    eventPublisher,
    bridge,
    permissionBridge,
    permissionPolicy,
    workspaceAskBridge,
  }: {
    router: SessionRouter;
    commandRouter?: SessionCommandRouter;
    eventPublisher?: SessionEventPublisher;
    bridge?: WebSocketPlatformBridge;
    permissionBridge?: SessionPermissionBridge;
    permissionPolicy?: FilePermissionPolicy;
    workspaceAskBridge?: SessionWorkspaceAskBridge;
  },
): void {
  const connectionId = `connection-${++nextConnectionId}`;
  let bridgeToken: BridgeToken | null = null;
  const boundSessions = new Map<string, SessionBindingToken>();
  const workspaceAskBoundSessions = new Map<string, SessionBindingToken>();
  const sendSession = (outgoing: SessionMessage) => {
    socket.send(JSON.stringify(outgoing));
  };
  const sendPublished = (outgoing: SessionEvent | ServerRequest) => {
    socket.send(JSON.stringify(outgoing));
  };
  const sendPlatform = (outgoing: PlatformBridgeMessage) => {
    socket.send(JSON.stringify(outgoing));
  };
  eventPublisher?.attachConnection(connectionId, sendPublished);

  socket.on("message", async (raw) => {
    const message = JSON.parse(raw.toString()) as SocketMessage;

    if (isPlatformBridgeMessage(message)) {
      if (message.type === "platform_bridge_hello" && bridge) {
        bridgeToken = bridge.attach(sendPlatform);
      } else if (message.type === "platform_response") {
        bridge?.handleResponse(message.payload, bridgeToken);
      }
      return;
    }

    if (isLegacyPermissionResponse(message) && permissionBridge) {
      const token = boundSessions.get(sessionIdFromRequestId(message.payload.requestId));
      if (token !== undefined) {
        permissionBridge.handleResponse(message.payload, token);
      }
      return;
    }

    if (isLegacyWorkspaceAskResponse(message) && workspaceAskBridge) {
      const token = workspaceAskBoundSessions.get(sessionIdFromRequestId(message.payload.requestId));
      if (token !== undefined) {
        workspaceAskBridge.handleResponse(message.payload, token);
      }
      return;
    }

    if (isClientResponse(message) && commandRouter) {
      commandRouter.handleResponse(message, connectionId);
      return;
    }

    if (message.type === "user_message") {
      if (permissionBridge && !boundSessions.has(message.sessionId)) {
        boundSessions.set(
          message.sessionId,
          permissionBridge.bindSession(message.sessionId, sendSession),
        );
      }
      if (workspaceAskBridge && !workspaceAskBoundSessions.has(message.sessionId)) {
        workspaceAskBoundSessions.set(
          message.sessionId,
          workspaceAskBridge.bindSession(message.sessionId, sendSession),
        );
      }
    }

    if (isSessionCommand(message) && commandRouter) {
      if ("sessionId" in message && typeof message.sessionId === "string") {
        eventPublisher?.subscribe(connectionId, message.sessionId);
      }
      if (message.type === "turn_start") {
        if (permissionBridge && !boundSessions.has(message.sessionId)) {
          boundSessions.set(
            message.sessionId,
            permissionBridge.bindSession(message.sessionId, (legacyMessage) => {
              const request = legacyToServerRequest(legacyMessage);
              if (request) {
                eventPublisher?.publishToConnection(connectionId, request);
              }
            }),
          );
        }
        if (workspaceAskBridge && !workspaceAskBoundSessions.has(message.sessionId)) {
          workspaceAskBoundSessions.set(
            message.sessionId,
            workspaceAskBridge.bindSession(message.sessionId, (legacyMessage) => {
              const request = legacyToServerRequest(legacyMessage);
              if (request) {
                eventPublisher?.publishToConnection(connectionId, request);
              }
            }),
          );
        }
      }
      if (message.type === "session_unsubscribe") {
        maybeUnbindSessionOwner(
          message.sessionId,
          boundSessions,
          workspaceAskBoundSessions,
          permissionBridge,
          permissionPolicy,
          workspaceAskBridge,
          router,
          sendSession,
        );
      }
      await commandRouter.receive(message, connectionId);
      return;
    }

    await router.receive(message, sendSession);
  });

  socket.on("close", () => {
    eventPublisher?.detachConnection(connectionId);
    if (bridgeToken !== null && bridge) {
      bridge.detach(bridgeToken);
    }
    for (const [sessionId, token] of boundSessions) {
      const unbound = permissionBridge?.unbindSession(sessionId, token) ?? false;
      if (unbound) {
        router.interruptSession(sessionId, sendSession);
        permissionPolicy?.clearSessionRules(sessionId);
      }
    }
    for (const [sessionId, token] of workspaceAskBoundSessions) {
      workspaceAskBridge?.unbindSession(sessionId, token);
    }
    boundSessions.clear();
    workspaceAskBoundSessions.clear();
  });
}

function isPlatformBridgeMessage(message: SocketMessage): message is PlatformBridgeMessage {
  return "channel" in message && message.channel === "platform";
}

function isSessionCommand(message: SocketMessage): message is SessionCommand {
  return [
    "session_create",
    "session_subscribe",
    "session_unsubscribe",
    "turn_start",
    "turn_interrupt",
    "sessions_list",
    "session_delete",
  ].includes((message as { type?: string }).type ?? "");
}

function isClientResponse(message: SocketMessage): message is ClientResponse {
  return message.type === "permission_answer" || message.type === "workspace_answer";
}

function isLegacyPermissionResponse(
  message: SocketMessage,
): message is Extract<SessionMessage, { type: "permission_response" }> {
  return message.type === "permission_response";
}

function isLegacyWorkspaceAskResponse(
  message: SocketMessage,
): message is Extract<SessionMessage, { type: "workspace_ask_response" }> {
  return message.type === "workspace_ask_response";
}

function sessionIdFromRequestId(requestId: string): string {
  const separator = requestId.lastIndexOf(":");
  return separator === -1 ? requestId : requestId.slice(0, separator);
}

export async function startServer({
  router,
  commandRouter,
  eventPublisher,
  bridge,
  permissionBridge,
  permissionPolicy,
  workspaceAskBridge,
  port = 4317,
}: {
  router: SessionRouter;
  commandRouter?: SessionCommandRouter;
  eventPublisher?: SessionEventPublisher;
  bridge?: WebSocketPlatformBridge;
  permissionBridge?: SessionPermissionBridge;
  permissionPolicy?: FilePermissionPolicy;
  workspaceAskBridge?: SessionWorkspaceAskBridge;
  port?: number;
}) {
  const { WebSocketServer } = await import("ws");
  const wss = new WebSocketServer({ port });

  wss.on("connection", (socket) => {
    attachSessionSocketHandlers(socket, {
      router,
      commandRouter,
      eventPublisher,
      bridge,
      permissionBridge,
      permissionPolicy,
      workspaceAskBridge,
    });
  });

  return wss;
}

export async function handleSocketMessage(
  router: SessionRouter,
  socket: Pick<WebSocket, "send">,
  raw: string,
) {
  const message = JSON.parse(raw) as SessionMessage;
  await router.receive(message, (outgoing) => {
    socket.send(JSON.stringify(outgoing));
  });
}

export async function startDefaultServer(port = 4317) {
  const [
    { AgentRuntime },
    { RemotePlatformAdapter },
    { FileWorkspaceRegistry },
    { FilePermissionPolicy },
    { SettingsBackedLLMClient },
    { SettingsBackedToolRegistry },
    { SessionScopedToolRegistry },
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
    import("../actions/SessionScopedToolRegistry.ts"),
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
  const store = new FileSessionStore(paths.sessionsDir);
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
  const workspaceAskBridge = new SessionWorkspaceAskBridge();
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
  const sessionScopedTools = new SessionScopedToolRegistry(
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

  const permissionBridge = new SessionPermissionBridge();
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

  const runtimeBySession = new Map<string, InstanceType<typeof AgentRuntime>>();
  const runtimeForSession = (sessionId: string) => {
    let runtime = runtimeBySession.get(sessionId);
    if (!runtime) {
      runtime = new AgentRuntime(llmClient, sessionScopedTools.registryForSession(sessionId), {
        permissionPolicy,
        blobStore,
        turnSummarizer: summarizer,
        onMetaToolActivate: async (activeSessionId) => {
          await sessionScopedTools.activate(activeSessionId);
        },
        isSessionActivated: (activeSessionId) => sessionScopedTools.isActivated(activeSessionId),
      });
      runtimeBySession.set(sessionId, runtime);
    }
    return runtime;
  };
  const persistence = new SessionPersistence(store, undefined, blobStore);
  const orchestrator = new SessionRuntimeOrchestrator(
    runtimeForSession,
    persistence,
    undefined,
    async (sessionId) => {
      await toolRegistry.refresh();
      const session = await persistence.getSession(sessionId);
      const binding = session?.metadata.actionBinding;

      if (!sessionScopedTools.isActivated(sessionId)) {
        if (binding) {
          await sessionScopedTools.activate(sessionId);
        } else {
          const history = await persistence.getMessages(sessionId);
          if (historyShowsToolsActivated(history)) {
            await sessionScopedTools.activate(sessionId);
          }
        }
      }

      await sessionScopedTools.refreshForSession(sessionId, binding);
    },
  );
  const router = new SessionRouter(
    orchestrator,
    persistence,
    undefined,
    new ActionBindingResolver({ pluginsDir: paths.pluginsDir }),
    (sessionId) => {
      sessionScopedTools.forgetSession(sessionId);
      runtimeBySession.delete(sessionId);
    },
  );
  const eventPublisher = new SessionEventPublisher();
  const commandRouter = new SessionCommandRouter(
    orchestrator,
    persistence,
    eventPublisher,
    undefined,
    new ActionBindingResolver({ pluginsDir: paths.pluginsDir }),
    (sessionId) => {
      sessionScopedTools.forgetSession(sessionId);
      runtimeBySession.delete(sessionId);
    },
    {
      onPermissionResponse: (response, connectionId) => {
        const token = boundTokenForConnection(connectionId, response.requestId, permissionBridgeBindings);
        if (token !== undefined) {
          permissionBridge.handleResponse(
            {
              requestId: response.requestId,
              decision: response.payload.decision,
              scope: response.payload.scope,
              reason: response.payload.reason,
            },
            token,
          );
        }
      },
      onWorkspaceResponse: (response, connectionId) => {
        const token = boundTokenForConnection(connectionId, response.requestId, workspaceBridgeBindings);
        if (token !== undefined) {
          workspaceAskBridge.handleResponse(
            {
              requestId: response.requestId,
              workspaceId: response.payload.workspaceId,
              cancelled: response.payload.cancelled,
            },
            token,
          );
        }
      },
    },
  );

  void commandRouter;
  void eventPublisher;

  return startServer({
    router,
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
  sessionsDir: string;
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
    sessionsDir: join(spotDir, "sessions"),
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

const permissionBridgeBindings = new Map<string, Map<string, SessionBindingToken>>();
const workspaceBridgeBindings = new Map<string, Map<string, SessionBindingToken>>();

function boundTokenForConnection(
  connectionId: string,
  requestId: string,
  bindings: Map<string, Map<string, SessionBindingToken>>,
): SessionBindingToken | undefined {
  return bindings.get(connectionId)?.get(sessionIdFromRequestId(requestId));
}

function legacyToServerRequest(message: SessionMessage): ServerRequest | null {
  if (message.type === "permission_request") {
    return {
      type: "permission_ask",
      requestId: message.payload.requestId,
      sessionId: message.sessionId,
      timestamp: message.timestamp,
      payload: {
        toolName: message.payload.toolName,
        toolCallId: message.payload.toolCallId,
        arguments: message.payload.arguments,
        timeoutMs: message.payload.timeoutMs,
      },
    };
  }
  if (message.type === "workspace_ask_request") {
    return {
      type: "workspace_ask",
      requestId: message.payload.requestId,
      sessionId: message.sessionId,
      timestamp: message.timestamp,
      payload: {
        toolCallId: message.payload.toolCallId,
        prompt: message.payload.prompt,
        candidates: message.payload.candidates,
        timeoutMs: message.payload.timeoutMs,
      },
    };
  }
  return null;
}

function maybeUnbindSessionOwner(
  sessionId: string,
  boundSessions: Map<string, SessionBindingToken>,
  workspaceAskBoundSessions: Map<string, SessionBindingToken>,
  permissionBridge: SessionPermissionBridge | undefined,
  permissionPolicy: FilePermissionPolicy | undefined,
  workspaceAskBridge: SessionWorkspaceAskBridge | undefined,
  router: SessionRouter,
  sendSession: (outgoing: SessionMessage) => void,
): void {
  const permissionToken = boundSessions.get(sessionId);
  if (permissionToken !== undefined) {
    const unbound = permissionBridge?.unbindSession(sessionId, permissionToken) ?? false;
    if (unbound) {
      router.interruptSession(sessionId, sendSession);
      permissionPolicy?.clearSessionRules(sessionId);
    }
    boundSessions.delete(sessionId);
  }

  const workspaceToken = workspaceAskBoundSessions.get(sessionId);
  if (workspaceToken !== undefined) {
    workspaceAskBridge?.unbindSession(sessionId, workspaceToken);
    workspaceAskBoundSessions.delete(sessionId);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdin.resume();
  process.stdin.on("end", () => process.exit(0));
  await startDefaultServer();
}
