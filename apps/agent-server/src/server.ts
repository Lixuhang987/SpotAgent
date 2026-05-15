import { pathToFileURL } from "node:url";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage.ts";
import { SessionManager } from "./SessionManager.ts";

export async function startServer({
  manager,
  port = 4317,
}: {
  manager: SessionManager;
  port?: number;
}) {
  const { WebSocketServer } = await import("ws");
  const wss = new WebSocketServer({ port });

  wss.on("connection", (socket) => {
    socket.on("message", async (raw) => {
      const message = JSON.parse(raw.toString()) as SessionMessage;
      await manager.receive(message, (outgoing) => {
        socket.send(JSON.stringify(outgoing));
      });
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
  const [{ AgentRuntime }, { ToolRegistry }, { SettingsBackedLLMClient }] = await Promise.all([
    import("../../../packages/core/src/runtime/AgentRuntime.ts"),
    import("../../../packages/core/src/tools/ToolRegistry.ts"),
    import("./SettingsBackedLLMClient.ts"),
  ]);

  const manager = new SessionManager(
    new AgentRuntime(new SettingsBackedLLMClient(), new ToolRegistry()),
  );

  return startServer({ manager, port });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startDefaultServer();
}
