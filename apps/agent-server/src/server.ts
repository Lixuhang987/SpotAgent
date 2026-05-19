import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SessionMessage } from "@handagent/core/protocol/SessionMessage.ts";
import { SessionPersistence } from "./SessionPersistence.ts";
import { SessionRouter } from "./SessionRouter.ts";
import { SessionRuntimeOrchestrator } from "./SessionRuntimeOrchestrator.ts";
import { FileSessionStore } from "@handagent/core/storage/index.ts";
import { WebSocketPlatformBridge } from "./WebSocketPlatformBridge.ts";
import { SessionPermissionBridge } from "./SessionPermissionBridge.ts";
import type { FilePermissionPolicy } from "@handagent/core/permission/FilePermissionPolicy.ts";

export async function startServer({
  router,
  bridge,
  permissionBridge,
  permissionPolicy,
  port = 4317,
}: {
  router: SessionRouter;
  bridge?: WebSocketPlatformBridge;
  permissionBridge?: SessionPermissionBridge;
  permissionPolicy?: FilePermissionPolicy;
  port?: number;
}) {
  const { WebSocketServer } = await import("ws");
  const wss = new WebSocketServer({ port });

  wss.on("connection", (socket) => {
    let isBridge = false;
    let boundSessionId: string | null = null;
    const send = (outgoing: SessionMessage) => {
      socket.send(JSON.stringify(outgoing));
    };

    socket.on("message", async (raw) => {
      const message = JSON.parse(raw.toString()) as SessionMessage;

      if (message.type === "platform_bridge_hello" && bridge) {
        isBridge = true;
        bridge.attach(send);
        return;
      }

      if (message.type === "platform_response") {
        bridge?.handleResponse(message.payload);
        return;
      }

      if (message.type === "permission_response" && permissionBridge) {
        permissionBridge.handleResponse(message.payload);
        return;
      }

      if (message.type === "user_message" && permissionBridge && !boundSessionId) {
        boundSessionId = message.sessionId;
        permissionBridge.bindSession(message.sessionId, send);
      }

      await router.receive(message, send);
    });

    socket.on("close", () => {
      if (isBridge && bridge) {
        bridge.detach();
      }
      if (boundSessionId && permissionBridge) {
        permissionBridge.unbindSession(boundSessionId);
        permissionPolicy?.clearSessionRules(boundSessionId);
      }
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
    { registerBuiltinTools },
    { RemotePlatformAdapter },
    { FileWorkspaceRegistry },
    { FilePermissionPolicy },
    { loadToolSettings },
    { SettingsBackedLLMClient },
    { FileNetworkLogger },
    { FilesystemBlobStore },
    { TurnSummarizer },
  ] = await Promise.all([
    import("@handagent/core/runtime/AgentRuntime.ts"),
    import("@handagent/core/tools/registerBuiltins.ts"),
    import("@handagent/core/platform/RemotePlatformAdapter.ts"),
    import("@handagent/core/workspace/FileWorkspaceRegistry.ts"),
    import("@handagent/core/permission/FilePermissionPolicy.ts"),
    import("@handagent/core/config/ToolSettings.ts"),
    import("./SettingsBackedLLMClient.ts"),
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
  const platform = new RemotePlatformAdapter({ bridge: platformBridge });
  const toolSettings = loadToolSettings();
  const { registry, registered, disabled } = registerBuiltinTools({
    platform,
    workspaceRegistry,
    settings: toolSettings,
  });

  console.log(`[agent-server] registered tools: ${registered.join(", ") || "(none)"}`);
  for (const d of disabled) {
    console.log(`[agent-server] disabled tool ${d.name}: ${d.reason}`);
  }

  const permissionBridge = new SessionPermissionBridge();
  const permissionPolicy = new FilePermissionPolicy({
    filePath: join(spotDir, "permissions.json"),
    askResolver: permissionBridge.ask,
  });

  const runtime = new AgentRuntime(new SettingsBackedLLMClient({ networkLogger }), registry, {
    permissionPolicy,
    blobStore,
    turnSummarizer: new TurnSummarizer({
      client: new SettingsBackedLLMClient({ networkLogger, purpose: "summarizer" }),
      blobStore,
    }),
  });
  const persistence = new SessionPersistence(store, undefined, blobStore);
  const orchestrator = new SessionRuntimeOrchestrator(runtime, persistence);
  const router = new SessionRouter(orchestrator, persistence);

  return startServer({
    router,
    bridge: platformBridge,
    permissionBridge,
    permissionPolicy,
    port,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdin.resume();
  process.stdin.on("end", () => process.exit(0));
  await startDefaultServer();
}
