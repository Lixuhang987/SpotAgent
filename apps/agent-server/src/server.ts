import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage.ts";
import { SessionManager } from "./SessionManager.ts";
import { FileSessionStore } from "../../../packages/core/src/storage/index.ts";
import { WebSocketPlatformBridge } from "./WebSocketPlatformBridge.ts";

export async function startServer({
  manager,
  bridge,
  port = 4317,
}: {
  manager: SessionManager;
  bridge?: WebSocketPlatformBridge;
  port?: number;
}) {
  const { WebSocketServer } = await import("ws");
  const wss = new WebSocketServer({ port });

  wss.on("connection", (socket) => {
    let isBridge = false;
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

      await manager.receive(message, send);
    });

    socket.on("close", () => {
      if (isBridge && bridge) {
        bridge.detach();
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
    { loadToolSettings },
    { SettingsBackedLLMClient },
  ] = await Promise.all([
    import("../../../packages/core/src/runtime/AgentRuntime.ts"),
    import("../../../packages/core/src/tools/registerBuiltins.ts"),
    import("../../../packages/core/src/platform/RemotePlatformAdapter.ts"),
    import("../../../packages/core/src/workspace/FileWorkspaceRegistry.ts"),
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

  const bridge = new WebSocketPlatformBridge();
  const platform = new RemotePlatformAdapter({ bridge });
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

  const manager = new SessionManager(
    new AgentRuntime(new SettingsBackedLLMClient(), registry),
    undefined,
    { store },
  );

  return startServer({ manager, bridge, port });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdin.resume();
  process.stdin.on("end", () => process.exit(0));
  await startDefaultServer();
}
