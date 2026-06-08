import type { EventEmitter } from "node:events";
import type {
  AgentServerHealthEvent,
  AgentServerLogSink,
  AgentServerSupervisor,
  AgentServerSupervisorDescription,
} from "./agentServerSupervisor.js";

type OutputStreamLike = {
  on(event: "data", listener: (chunk: unknown) => void): unknown;
};

export type UtilityProcessLike = EventEmitter & {
  stdout?: OutputStreamLike | null;
  stderr?: OutputStreamLike | null;
  kill(): boolean;
};

type UtilityForkOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio: "pipe";
  serviceName: string;
};

type Options = {
  repoRoot: string;
  entry: string;
  env: NodeJS.ProcessEnv;
  forkUtilityProcess: (
    modulePath: string,
    args: string[],
    options: UtilityForkOptions,
  ) => UtilityProcessLike;
  waitForReady: () => Promise<void>;
  scheduleRestart?: (callback: () => void, delayMs: number) => void;
  maxRestartAttempts?: number;
  logSink?: AgentServerLogSink;
};

export class UtilityProcessAgentServerSupervisor implements AgentServerSupervisor {
  private process: UtilityProcessLike | null = null;
  private listeners = new Set<(event: AgentServerHealthEvent) => void>();
  private userRequestedStop = false;
  private restartAttempts = 0;
  private restartGeneration = 0;
  private readonly scheduleRestart: (callback: () => void, delayMs: number) => void;
  private readonly maxRestartAttempts: number;

  constructor(private readonly options: Options) {
    this.scheduleRestart =
      options.scheduleRestart ??
      ((callback, delayMs) => {
        setTimeout(callback, delayMs);
      });
    this.maxRestartAttempts = options.maxRestartAttempts ?? 5;
  }

  describe(): AgentServerSupervisorDescription {
    return {
      mode: "utility_process",
      entry: this.options.entry,
      coreRuntimeHost: "agent-server",
      utilityProcessBlocker: null,
    };
  }

  onHealth(listener: (event: AgentServerHealthEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.process) {
      return;
    }

    this.userRequestedStop = false;
    const utilityProcess = this.options.forkUtilityProcess(this.options.entry, [], {
      cwd: this.options.repoRoot,
      env: { ...process.env, ...this.options.env },
      stdio: "pipe",
      serviceName: "HandAgent agent-server",
    });
    this.process = utilityProcess;
    utilityProcess.on("exit", (code: number | null) =>
      this.handleExit(utilityProcess, code),
    );
    utilityProcess.on("error", (_type: unknown, location: unknown, report: unknown) => {
      this.handleFailure(
        utilityProcess,
        `agent-server utility process error at ${String(location)}: ${String(report)}`,
      );
    });
    this.drainOutput(utilityProcess);
    void this.emitAvailableWhenReady(utilityProcess, this.restartGeneration);
  }

  stop(): void {
    this.userRequestedStop = true;
    this.restartGeneration += 1;
    const utilityProcess = this.process;
    this.process = null;
    utilityProcess?.kill();
    this.emitHealth({ available: false, message: "agent-server stopped" });
  }

  private async emitAvailableWhenReady(
    utilityProcess: UtilityProcessLike,
    generation: number,
  ): Promise<void> {
    try {
      await this.options.waitForReady();
    } catch (error) {
      if (this.process !== utilityProcess || this.userRequestedStop || generation !== this.restartGeneration) {
        return;
      }

      utilityProcess.kill();
      this.handleFailure(utilityProcess, `agent-server readiness failed: ${errorMessage(error)}`);
      return;
    }

    if (this.process === utilityProcess && !this.userRequestedStop && generation === this.restartGeneration) {
      this.restartAttempts = 0;
      this.emitHealth({ available: true });
    }
  }

  private handleExit(utilityProcess: UtilityProcessLike, code: number | null): void {
    if (this.process !== utilityProcess) {
      return;
    }

    if (this.userRequestedStop || code === 0) {
      this.process = null;
      return;
    }

    this.handleFailure(
      utilityProcess,
      `agent-server exited with code ${code ?? "unknown"}`,
    );
  }

  private handleFailure(utilityProcess: UtilityProcessLike, message: string): void {
    if (this.process !== utilityProcess) {
      return;
    }

    this.process = null;
    if (this.restartAttempts >= this.maxRestartAttempts) {
      this.emitHealth({
        available: false,
        message: `agent-server stopped after ${this.maxRestartAttempts} restart attempts: ${message}`,
      });
      return;
    }

    this.emitHealth({ available: false, message });
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

  private drainOutput(utilityProcess: UtilityProcessLike): void {
    utilityProcess.stdout?.on("data", (chunk) => this.writeLog(formatOutput("stdout", chunk)));
    utilityProcess.stderr?.on("data", (chunk) => this.writeLog(formatOutput("stderr", chunk)));
  }

  private writeLog(line: string): void {
    if (this.options.logSink) {
      this.options.logSink(line);
      return;
    }
    process.stderr.write(line);
  }
}

function formatOutput(streamName: "stdout" | "stderr", chunk: unknown): string {
  const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  return `[agent-server ${streamName}] ${text}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
