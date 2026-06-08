import { spawn, type ChildProcess } from "node:child_process";
import type { EventEmitter } from "node:events";
import { createConnection } from "node:net";

export type AgentServerHealthEvent = {
  available: boolean;
  message?: string;
};

export type AgentServerChildProcess = EventEmitter & {
  stdout?: EventEmitter | null;
  stderr?: EventEmitter | null;
  killed?: boolean;
  kill(signal?: NodeJS.Signals | number): void;
};

type SpawnOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
};

type SupervisorOptions = {
  repoRoot: string;
  nodePath: string;
  env: NodeJS.ProcessEnv;
  spawnProcess?: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => AgentServerChildProcess;
  scheduleRestart?: (callback: () => void, delayMs: number) => void;
  waitForReady?: () => Promise<void>;
  serverHost?: string;
  serverPort?: number;
  readinessTimeoutMs?: number;
  readinessPollIntervalMs?: number;
  maxRestartAttempts?: number;
};

export class NodeAgentServerSupervisor {
  private child: AgentServerChildProcess | null = null;
  private userRequestedStop = false;
  private restartAttempts = 0;
  private restartGeneration = 0;
  private listeners = new Set<(event: AgentServerHealthEvent) => void>();
  private readonly spawnProcess: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => AgentServerChildProcess;
  private readonly scheduleRestart: (callback: () => void, delayMs: number) => void;
  private readonly waitForReady: () => Promise<void>;
  private readonly maxRestartAttempts: number;

  constructor(private readonly options: SupervisorOptions) {
    this.spawnProcess =
      options.spawnProcess ??
      ((command, args, spawnOptions) =>
        spawn(command, args, spawnOptions) as ChildProcess);
    this.scheduleRestart =
      options.scheduleRestart ??
      ((callback, delayMs) => {
        setTimeout(callback, delayMs);
      });
    this.waitForReady = options.waitForReady ?? (() => waitForTcpPort({
      host: options.serverHost ?? "127.0.0.1",
      port: options.serverPort ?? 4317,
      timeoutMs: options.readinessTimeoutMs ?? 30_000,
      pollIntervalMs: options.readinessPollIntervalMs ?? 100,
    }));
    this.maxRestartAttempts = options.maxRestartAttempts ?? 5;
  }

  onHealth(listener: (event: AgentServerHealthEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.child) {
      return;
    }

    this.userRequestedStop = false;
    const args = [
      "--experimental-transform-types",
      "--experimental-specifier-resolution=node",
      "apps/agent-server/src/server/server.ts",
    ];
    const child = this.spawnProcess(this.options.nodePath, args, {
      cwd: this.options.repoRoot,
      env: { ...process.env, ...this.options.env },
    });
    this.child = child;
    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) =>
      this.handleExit(child, code, signal),
    );
    child.on("error", (error: Error) =>
      this.handleProcessError(child, error),
    );
    void this.emitAvailableWhenReady(child, this.restartGeneration);
  }

  stop(): void {
    this.userRequestedStop = true;
    this.restartGeneration += 1;
    const child = this.child;
    this.child = null;
    child?.kill();
    this.emitHealth({ available: false, message: "agent-server stopped" });
  }

  private handleExit(
    child: AgentServerChildProcess,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    if (this.child !== child) {
      return;
    }

    if (this.userRequestedStop || code === 0) {
      this.child = null;
      return;
    }

    const message =
      code === null
        ? `agent-server exited from signal ${signal ?? "unknown"}`
        : `agent-server exited with code ${code}`;
    this.handleFailure(message);
  }

  private handleProcessError(child: AgentServerChildProcess, error: Error): void {
    if (this.child !== child) {
      return;
    }

    this.handleFailure(`agent-server process error: ${error.message}`);
  }

  private async emitAvailableWhenReady(
    child: AgentServerChildProcess,
    generation: number,
  ): Promise<void> {
    try {
      await this.waitForReady();
    } catch (error) {
      if (this.child !== child || this.userRequestedStop || generation !== this.restartGeneration) {
        return;
      }

      child.kill();
      const message = error instanceof Error ? error.message : "unknown error";
      this.handleFailure(`agent-server readiness failed: ${message}`);
      return;
    }

    if (this.child !== child || this.userRequestedStop || generation !== this.restartGeneration) {
      return;
    }

    this.restartAttempts = 0;
    this.emitHealth({ available: true });
  }

  private handleFailure(message: string): void {
    this.child = null;
    this.emitHealth({ available: false, message });
    if (this.restartAttempts >= this.maxRestartAttempts) {
      return;
    }

    const delayMs = Math.min(30_000, 2 ** this.restartAttempts * 1_000);
    this.restartAttempts += 1;
    const generation = this.restartGeneration;
    this.scheduleRestart(() => {
      if (this.userRequestedStop || generation !== this.restartGeneration) {
        return;
      }
      this.start();
    }, delayMs);
  }

  private emitHealth(event: AgentServerHealthEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

type TcpReadinessOptions = {
  host: string;
  port: number;
  timeoutMs: number;
  pollIntervalMs: number;
};

async function waitForTcpPort(options: TcpReadinessOptions): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() <= deadline) {
    if (await canConnect(options.host, options.port)) {
      return;
    }
    await sleep(options.pollIntervalMs);
  }

  throw new Error(`timed out waiting for ${options.host}:${options.port}`);
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (available: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(available);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
