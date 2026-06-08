import { spawn, type ChildProcess } from "node:child_process";
import type { EventEmitter } from "node:events";

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
    this.emitHealth({ available: true });
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
