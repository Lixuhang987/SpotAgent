import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage.ts";
import { SessionManager } from "./SessionManager.ts";
import { FileSessionStore } from "../../../packages/core/src/storage/index.ts";
import { WebSocketPlatformBridge } from "./WebSocketPlatformBridge.ts";
import { SessionPermissionBridge } from "./SessionPermissionBridge.ts";

export async function startServer({
  manager,
  bridge,
  permissionBridge,
  port = 4317,
}: {
  manager: SessionManager;
  bridge?: WebSocketPlatformBridge;
  permissionBridge?: SessionPermissionBridge;
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

      await manager.receive(message, send);
    });

    socket.on("close", () => {
      if (isBridge && bridge) {
        bridge.detach();
      }
      if (boundSessionId && permissionBridge) {
        permissionBridge.unbindSession(boundSessionId);
      }
    });
  });

  return wss;
}

export async function handleSocketMessage(
  manager: SessionManager,
  socket: Pick<WebSocket, "send">,
  raw: string,
) {
  const message = JSON.parse(raw) as SessionMessage;
  await manager.receive(message, (outgoing) => {
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
  ] = await Promise.all([
    import("../../../packages/core/src/runtime/AgentRuntime.ts"),
    import("../../../packages/core/src/tools/registerBuiltins.ts"),
    import("../../../packages/core/src/platform/RemotePlatformAdapter.ts"),
    import("../../../packages/core/src/workspace/FileWorkspaceRegistry.ts"),
    import("../../../packages/core/src/permission/FilePermissionPolicy.ts"),
    import("../../../packages/core/src/config/ToolSettings.ts"),
    import("./SettingsBackedLLMClient.ts"),
  ]);

  const spotDir = join(homedir(), ".spotAgent");
  const sessionsDir = join(spotDir, "sessions");
  const store = new FileSessionStore(sessionsDir);

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

  const manager = new SessionManager(
    new AgentRuntime(new SettingsBackedLLMClient(), registry, {
      permissionPolicy,
    }),
    undefined,
    { store },
  );

  return startServer({ manager, bridge: platformBridge, permissionBridge, port });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdin.resume();
  process.stdin.on("end", () => process.exit(0));
  await startDefaultServer();
}
