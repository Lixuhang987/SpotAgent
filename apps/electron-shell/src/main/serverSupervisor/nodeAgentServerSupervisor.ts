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
      this.handleExit(code, signal),
    );
    this.emitHealth({ available: true });
  }

  stop(): void {
    this.userRequestedStop = true;
    const child = this.child;
    this.child = null;
    child?.kill();
    this.emitHealth({ available: false, message: "agent-server stopped" });
  }

  private handleExit(
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    this.child = null;
    if (this.userRequestedStop || code === 0) {
      return;
    }

    const message =
      code === null
        ? `agent-server exited from signal ${signal ?? "unknown"}`
        : `agent-server exited with code ${code}`;
    this.emitHealth({ available: false, message });

    if (this.restartAttempts >= this.maxRestartAttempts) {
      return;
    }

    const delayMs = Math.min(30_000, 2 ** this.restartAttempts * 1_000);
    this.restartAttempts += 1;
    this.scheduleRestart(() => this.start(), delayMs);
  }

  private emitHealth(event: AgentServerHealthEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
