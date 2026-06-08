import { BrowserWindow, app } from "electron";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCommand,
  type ElectronToSwiftEvent,
  type SwiftToElectronCommand,
} from "./protocol/electronShellProtocol.js";
import { NodeAgentServerSupervisor } from "./serverSupervisor/nodeAgentServerSupervisor.js";
import { JsonLineBridge } from "./swiftBridge/jsonLineBridge.js";
import { ThreadWindowPrewarmer } from "./windows/threadWindowPrewarmer.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.HANDAGENT_REPO_ROOT ?? resolve(currentDir, "../../../..");
const nodePath = process.env.HANDAGENT_NODE_PATH ?? "node";
const threadWindowURL =
  process.env.HANDAGENT_THREAD_WINDOW_WEB_URL ?? "http://127.0.0.1:4317/thread-window/index.html";
const preloadPath = join(currentDir, "../preload/threadWindowPreload.js");

const bridge = new JsonLineBridge({ input: process.stdin, output: process.stdout });
const supervisor = new NodeAgentServerSupervisor({
  repoRoot,
  nodePath,
  env: process.env.HANDAGENT_LLM_MODE
    ? { HANDAGENT_LLM_MODE: process.env.HANDAGENT_LLM_MODE }
    : {},
});

const prewarmer = new ThreadWindowPrewarmer({
  threadWindowURL,
  preloadPath,
  onClosed: (wasPrepared) => {
    if (hasStoppedSupervisor) {
      return;
    }
    send({
      channel: "electron_shell",
      type: "thread_window.closed",
      timestamp: now(),
      wasVisible: false,
    });
    if (wasPrepared && hasAgentServerHealth) {
      void prepareThreadWindowAfterServerReady();
    }
  },
  createWindow: (options) => {
    const window = new BrowserWindow(options);
    window.webContents.on("render-process-gone", (_event, details) => {
      if (details.reason === "clean-exit") {
        return;
      }
      send({
        channel: "electron_shell",
        type: "renderer.crashed",
        window: "thread",
        reason: details.reason,
      });
    });
    return window;
  },
});

let hasStartedSupervisor = false;
let hasStoppedSupervisor = false;
let hasAgentServerHealth = false;
let prepareAfterServerReadyPromise: Promise<void> | null = null;

function send(event: ElectronToSwiftEvent): void {
  bridge.send(event);
}

function now(): string {
  return new Date().toISOString();
}

function ack(command: SwiftToElectronCommand, ok: boolean, error?: string): void {
  send({
    channel: "electron_shell",
    type: "command.ack",
    commandId: command.commandId,
    ok,
    ...(error ? { error } : {}),
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function commandIdFromRawLine(line: string): string | null {
  try {
    const value = JSON.parse(line) as unknown;
    if (typeof value === "object" && value !== null && "commandId" in value) {
      const commandId = (value as { commandId?: unknown }).commandId;
      return typeof commandId === "string" ? commandId : null;
    }
  } catch {
    return null;
  }
  return null;
}

async function prepareThreadWindowAfterServerReady(): Promise<void> {
  if (prepareAfterServerReadyPromise) {
    return prepareAfterServerReadyPromise;
  }

  prepareAfterServerReadyPromise = prewarmer.prepare()
    .then(() => {
      if (hasStoppedSupervisor) {
        return;
      }
      send({
        channel: "electron_shell",
        type: "thread_window.prepared",
        timestamp: now(),
      });
    })
    .catch((error: unknown) => {
      if (hasStoppedSupervisor) {
        return;
      }
      send({
        channel: "electron_shell",
        type: "thread_window.prepare_failed",
        message: errorMessage(error),
      });
    })
    .finally(() => {
      prepareAfterServerReadyPromise = null;
    });

  return prepareAfterServerReadyPromise;
}

function startSupervisor(): void {
  if (hasStartedSupervisor || hasStoppedSupervisor) {
    return;
  }

  hasStartedSupervisor = true;
  supervisor.start();
}

function stopSupervisor(): void {
  if (hasStoppedSupervisor) {
    return;
  }

  hasStoppedSupervisor = true;
  if (hasStartedSupervisor) {
    supervisor.stop();
  }
}

async function handleCommandLine(line: string): Promise<void> {
  let command: SwiftToElectronCommand;
  try {
    command = parseCommand(line);
  } catch (error) {
    const commandId = commandIdFromRawLine(line);
    if (commandId) {
      send({
        channel: "electron_shell",
        type: "command.ack",
        commandId,
        ok: false,
        error: errorMessage(error),
      });
    }
    return;
  }

  if (command.type === "shutdown") {
    ack(command, true);
    stopSupervisor();
    app.quit();
    return;
  }

  if (command.type === "thread_window.open_initial_prompt") {
    try {
      await prewarmer.openInitialPrompt(command.payload);
      ack(command, true);
    } catch (error) {
      ack(command, false, errorMessage(error));
    }
    return;
  }

  ack(command, false, "command is not active in phase 0");
}

supervisor.onHealth((event) => {
  hasAgentServerHealth = event.available;
  send({
    channel: "electron_shell",
    type: "agent_server.health",
    available: event.available,
    ...(event.message ? { message: event.message } : {}),
  });

  if (event.available && !hasStoppedSupervisor) {
    void prepareThreadWindowAfterServerReady();
  }
});

bridge.onLine((line) => {
  void handleCommandLine(line);
});

process.stdin.on("end", () => {
  stopSupervisor();
  app.quit();
});

app.on("before-quit", () => {
  stopSupervisor();
});

try {
  await app.whenReady();
  send({ channel: "electron_shell", type: "electron.ready", timestamp: now() });
  startSupervisor();
} catch (error) {
  send({
    channel: "electron_shell",
    type: "thread_window.prepare_failed",
    message: errorMessage(error),
  });
  app.exit(1);
}
