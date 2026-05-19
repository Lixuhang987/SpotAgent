import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SessionMessage } from "@handagent/core/protocol/SessionMessage.ts";
import type { PlatformBridgeMessage } from "@handagent/core/protocol/PlatformBridgeMessage.ts";
import { SessionPersistence } from "./SessionPersistence.ts";
import { SessionRouter } from "./SessionRouter.ts";
import { SessionRuntimeOrchestrator } from "./SessionRuntimeOrchestrator.ts";
import { FileSessionStore } from "@handagent/core/storage/index.ts";
import {
  WebSocketPlatformBridge,
  type BridgeToken,
} from "./WebSocketPlatformBridge.ts";
import {
  SessionPermissionBridge,
  type SessionBindingToken,
} from "./SessionPermissionBridge.ts";
import { SessionWorkspaceAskBridge } from "./SessionWorkspaceAskBridge.ts";
import type { FilePermissionPolicy } from "@handagent/core/permission/FilePermissionPolicy.ts";

type SessionSocket = {
  send(data: string): void;
  on(event: "message", listener: (raw: { toString(): string }) => void): void;
  on(event: "close", listener: () => void): void;
};

type SocketMessage = SessionMessage | PlatformBridgeMessage;

export function attachSessionSocketHandlers(
  socket: SessionSocket,
  {
    router,
    bridge,
    permissionBridge,
    permissionPolicy,
    workspaceAskBridge,
  }: {
    router: SessionRouter;
    bridge?: WebSocketPlatformBridge;
    permissionBridge?: SessionPermissionBridge;
    permissionPolicy?: FilePermissionPolicy;
    workspaceAskBridge?: SessionWorkspaceAskBridge;
  },
): void {
  let bridgeToken: BridgeToken | null = null;
  const boundSessions = new Map<string, SessionBindingToken>();
  const workspaceAskBoundSessions = new Map<string, SessionBindingToken>();
  const sendSession = (outgoing: SessionMessage) => {
    socket.send(JSON.stringify(outgoing));
  };
  const sendPlatform = (outgoing: PlatformBridgeMessage) => {
    socket.send(JSON.stringify(outgoing));
  };

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

    if (message.type === "permission_response" && permissionBridge) {
      const token = boundSessions.get(sessionIdFromRequestId(message.payload.requestId));
      if (token !== undefined) {
        permissionBridge.handleResponse(message.payload, token);
      }
      return;
    }

    if (message.type === "workspace_ask_response" && workspaceAskBridge) {
      const token = workspaceAskBoundSessions.get(sessionIdFromRequestId(message.payload.requestId));
      if (token !== undefined) {
        workspaceAskBridge.handleResponse(message.payload, token);
      }
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

    await router.receive(message, sendSession);
  });

  socket.on("close", () => {
    if (bridgeToken !== null && bridge) {
      bridge.detach(bridgeToken);
    }
    for (const [sessionId, token] of boundSessions) {
      const unbound = permissionBridge?.unbindSession(sessionId, token) ?? false;
      if (unbound) {
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

function sessionIdFromRequestId(requestId: string): string {
  const separator = requestId.lastIndexOf(":");
  return separator === -1 ? requestId : requestId.slice(0, separator);
}

export async function startServer({
  router,
  bridge,
  permissionBridge,
  permissionPolicy,
  workspaceAskBridge,
  port = 4317,
}: {
  router: SessionRouter;
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
    { FileNetworkLogger },
    { FilesystemBlobStore },
    { TurnSummarizer },
  ] = await Promise.all([
    import("@handagent/core/runtime/AgentRuntime.ts"),
    import("@handagent/core/platform/RemotePlatformAdapter.ts"),
    import("@handagent/core/workspace/FileWorkspaceRegistry.ts"),
    import("@handagent/core/permission/FilePermissionPolicy.ts"),
    import("./SettingsBackedLLMClient.ts"),
    import("./SettingsBackedToolRegistry.ts"),
    import("@handagent/core/logging/FileNetworkLogger.ts"),
    import("@handagent/core/blob/FilesystemBlobStore.ts"),
    import("@handagent/core/runtime/TurnSummarizer.ts"),
  ]);

  const spotDir = join(homedir(), ".spotAgent");
  const sessionsDir = join(spotDir, "sessions");
  const store = new FileSessionStore(sessionsDir);
  const networkLogger = new FileNetworkLogger({ baseDir: join(spotDir, "log") });
  const blobStore = new FilesystemBlobStore({ rootPath: join(spotDir, "blobs") });

  const workspaceRegistry = new FileWorkspaceRegistry({
    filePath: join(spotDir, "workspaces.json"),
    defaultRootPath: join(spotDir, "workspace"),
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
  toolRegistry.refresh();

  const permissionBridge = new SessionPermissionBridge();
  const permissionPolicy = new FilePermissionPolicy({
    filePath: join(spotDir, "permissions.json"),
    askResolver: permissionBridge.ask,
  });

  const runtime = new AgentRuntime(new SettingsBackedLLMClient({ networkLogger }), toolRegistry.registry, {
    permissionPolicy,
    blobStore,
    turnSummarizer: new TurnSummarizer({
      client: new SettingsBackedLLMClient({ networkLogger, purpose: "summarizer" }),
      blobStore,
    }),
  });
  const persistence = new SessionPersistence(store, undefined, blobStore);
  const orchestrator = new SessionRuntimeOrchestrator(
    runtime,
    persistence,
    undefined,
    () => {
      toolRegistry.refresh();
    },
  );
  const router = new SessionRouter(orchestrator, persistence);

  return startServer({
    router,
    bridge: platformBridge,
    permissionBridge,
    permissionPolicy,
    workspaceAskBridge,
    port,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdin.resume();
  process.stdin.on("end", () => process.exit(0));
  await startDefaultServer();
}
