import { BrowserWindow, app, ipcMain, screen, utilityProcess } from "electron";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ElectronShellRuntime, errorMessage } from "./electronShellRuntime.js";
import { handleActivityWindowFocusThreadIpc } from "./activityWindowIpc.js";
import {
  parseCommand,
  type ElectronToSwiftEvent,
  type SwiftToElectronCommand,
} from "./protocol/electronShellProtocol.js";
import { createAgentServerSupervisor } from "./serverSupervisor/agentServerSupervisorFactory.js";
import { JsonLineBridge } from "./swiftBridge/jsonLineBridge.js";
import { CommandSocketServer } from "./swiftBridge/commandSocketServer.js";
import { ActivityWindowController } from "./windows/activityWindowController.js";
import { ThreadWindowPrewarmer } from "./windows/threadWindowPrewarmer.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.HANDAGENT_REPO_ROOT ?? resolve(currentDir, "../../../..");
const nodePath = process.env.HANDAGENT_NODE_PATH ?? "node";
const threadWindowURL =
  process.env.HANDAGENT_THREAD_WINDOW_WEB_URL ?? "http://127.0.0.1:4317/thread-window/index.html";
const threadPreloadPath = join(currentDir, "../preload/threadWindowPreload.js");
const activityWindowHTMLPath = join(currentDir, "../activity-window/index.html");
const activityPreloadPath = join(currentDir, "../preload/activityWindowPreload.js");
const commandSocketPath = process.env.HANDAGENT_ELECTRON_COMMAND_SOCKET;

const bridge = new JsonLineBridge({ input: process.stdin, output: process.stdout });
let commandSocketServer: CommandSocketServer | null = null;
const supervisor = createAgentServerSupervisor({
  repoRoot,
  nodePath,
  env: process.env.HANDAGENT_LLM_MODE
    ? { HANDAGENT_LLM_MODE: process.env.HANDAGENT_LLM_MODE }
    : {},
  forkUtilityProcess: (modulePath, args, options) =>
    utilityProcess.fork(modulePath, args, options),
  logSink: (line) => process.stderr.write(line),
});

const prewarmer = new ThreadWindowPrewarmer({
  threadWindowURL,
  preloadPath: threadPreloadPath,
  onClosed: (event) => {
    if (hasStoppedSupervisor) {
      return;
    }
    runtime.handleThreadWindowClosed(event);
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

const activityWindow = new ActivityWindowController({
  activityWindowHTMLPath,
  preloadPath: activityPreloadPath,
  createWindow: (options) => new BrowserWindow(options),
  screenProvider: {
    getPrimaryWorkArea: () => screen.getPrimaryDisplay().workArea,
  },
  onRendererCrashed: (reason) => {
    send({
      channel: "electron_shell",
      type: "renderer.crashed",
      window: "activity",
      reason,
    });
  },
  onNativeFocus: () => {
    runtime.handleActivityWindowNativeFocus();
  },
  onNativeMouseDown: () => {
    runtime.handleActivityWindowNativeMouseDown();
  },
});

let hasStartedSupervisor = false;
let hasStoppedSupervisor = false;

function send(event: ElectronToSwiftEvent): void {
  bridge.send(event);
}

function now(): string {
  return new Date().toISOString();
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

const runtime = new ElectronShellRuntime({
  prewarmer,
  activityWindow,
  send,
  now,
  stopSupervisor,
  quit: () => app.quit(),
});

ipcMain.on("activity-window:focus-thread", (event, threadId: unknown) => {
  handleActivityWindowFocusThreadIpc(event, threadId, {
    activityWebContents: () => activityWindow.currentWebContents(),
    runtime,
  });
});

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

  await runtime.handleCommand(command);
}

supervisor.onHealth((event) => {
  runtime.handleAgentServerHealth(event);
});

bridge.onLine((line) => {
  void handleCommandLine(line);
});

process.stdin.on("end", () => {
  if (!commandSocketPath) {
    stopSupervisor();
    app.quit();
  }
});

app.on("before-quit", () => {
  commandSocketServer?.close();
  stopSupervisor();
});

void bootElectronShell();

async function bootElectronShell(): Promise<void> {
  try {
    await app.whenReady();
    if (commandSocketPath) {
      commandSocketServer = new CommandSocketServer(commandSocketPath);
      commandSocketServer.onLine((line) => {
        void handleCommandLine(line);
      });
    }
    await commandSocketServer?.start();
    send({ channel: "electron_shell", type: "electron.ready", timestamp: now() });
    process.stderr.write(`[electron-shell] agent-server supervisor: ${JSON.stringify(supervisor.describe())}\n`);
    startSupervisor();
  } catch (error) {
    send({
      channel: "electron_shell",
      type: "thread_window.prepare_failed",
      message: errorMessage(error),
    });
    app.exit(1);
  }
}
