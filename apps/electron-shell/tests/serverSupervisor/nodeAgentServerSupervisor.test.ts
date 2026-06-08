import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  NodeAgentServerSupervisor,
  type AgentServerChildProcess,
} from "../../src/main/serverSupervisor/nodeAgentServerSupervisor.js";

describe("NodeAgentServerSupervisor", () => {
  it("spawns the current TypeScript agent-server entry once", () => {
    const spawned: Array<{ command: string; args: string[]; cwd: string }> = [];
    const process = new FakeChildProcess();
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: { HANDAGENT_LLM_MODE: "mock" },
      waitForReady: () => Promise.resolve(),
      spawnProcess: (command, args, options) => {
        spawned.push({ command, args, cwd: options.cwd });
        return process;
      },
    });

    supervisor.start();
    supervisor.start();

    expect(spawned).toEqual([
      {
        command: "/usr/bin/node",
        args: [
          "--experimental-transform-types",
          "--experimental-specifier-resolution=node",
          "apps/agent-server/src/server/server.ts",
        ],
        cwd: "/repo",
      },
    ]);
  });

  it("emits available health only after readiness resolves", async () => {
    const process = new FakeChildProcess();
    const health: Array<{ available: boolean; message?: string }> = [];
    const ready = new Deferred<void>();
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      spawnProcess: () => process,
      waitForReady: () => ready.promise,
    });
    supervisor.onHealth((event) => health.push(event));

    supervisor.start();
    expect(health).toEqual([]);

    ready.resolve();
    await ready.promise;
    await Promise.resolve();

    expect(health).toEqual([{ available: true }]);
  });

  it("drains child stdout and stderr", () => {
    const process = new FakeChildProcess();
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      waitForReady: () => Promise.resolve(),
      spawnProcess: () => process,
    });

    supervisor.start();

    expect(process.stdout.listenerCount("data")).toBeGreaterThan(0);
    expect(process.stderr.listenerCount("data")).toBeGreaterThan(0);
  });

  it("describes the node child supervisor and utilityProcess blocker", () => {
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      utilityProcessBlocker: "missing built JS entry",
      waitForReady: () => Promise.resolve(),
      spawnProcess: () => new FakeChildProcess(),
    });

    expect(supervisor.describe()).toEqual({
      mode: "node_child",
      entry: "apps/agent-server/src/server/server.ts",
      coreRuntimeHost: "agent-server",
      utilityProcessBlocker: "missing built JS entry",
    });
  });

  it("writes child stdout and stderr to the injected log sink", () => {
    const process = new FakeChildProcess();
    const lines: string[] = [];
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      logSink: (line) => lines.push(line),
      waitForReady: () => Promise.resolve(),
      spawnProcess: () => process,
    });

    supervisor.start();
    process.stdout.emit("data", Buffer.from("ready\n"));
    process.stderr.emit("data", Buffer.from("warn\n"));

    expect(lines).toEqual([
      "[agent-server stdout] ready\n",
      "[agent-server stderr] warn\n",
    ]);
  });

  it("emits unavailable health on non-zero exit", () => {
    const process = new FakeChildProcess();
    const health: Array<{ available: boolean; message?: string }> = [];
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      waitForReady: () => Promise.resolve(),
      spawnProcess: () => process,
      scheduleRestart: vi.fn(),
    });
    supervisor.onHealth((event) => health.push(event));

    supervisor.start();
    process.emit("exit", 9, null);

    expect(health.at(-1)).toEqual({
      available: false,
      message: "agent-server exited with code 9",
    });
  });

  it("kills the child process on stop without scheduling restart", () => {
    const process = new FakeChildProcess();
    const scheduleRestart = vi.fn();
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      waitForReady: () => Promise.resolve(),
      spawnProcess: () => process,
      scheduleRestart,
    });

    supervisor.start();
    supervisor.stop();
    process.emit("exit", 0, null);

    expect(process.killed).toBe(true);
    expect(scheduleRestart).not.toHaveBeenCalled();
  });

  it("does not restart from a stale callback after stop", () => {
    const process = new FakeChildProcess();
    const spawned: FakeChildProcess[] = [];
    const scheduled: Array<() => void> = [];
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      waitForReady: () => Promise.resolve(),
      spawnProcess: () => {
        spawned.push(process);
        return process;
      },
      scheduleRestart: (callback) => scheduled.push(callback),
    });

    supervisor.start();
    process.emit("exit", 9, null);
    supervisor.stop();
    scheduled[0]?.();

    expect(spawned).toHaveLength(1);
  });

  it("emits unavailable health on child process errors", () => {
    const process = new FakeChildProcess();
    const health: Array<{ available: boolean; message?: string }> = [];
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/missing/node",
      env: {},
      waitForReady: () => Promise.resolve(),
      spawnProcess: () => process,
      scheduleRestart: vi.fn(),
    });
    supervisor.onHealth((event) => health.push(event));

    supervisor.start();
    process.emit("error", new Error("spawn failed"));

    expect(health.at(-1)).toEqual({
      available: false,
      message: "agent-server process error: spawn failed",
    });
  });

  it("reports a final unavailable health event after max restart attempts", () => {
    const process = new FakeChildProcess();
    const health: Array<{ available: boolean; message?: string }> = [];
    const scheduled: Array<() => void> = [];
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      maxRestartAttempts: 1,
      waitForReady: () => Promise.resolve(),
      spawnProcess: () => process,
      scheduleRestart: (callback) => scheduled.push(callback),
    });
    supervisor.onHealth((event) => health.push(event));

    supervisor.start();
    process.emit("exit", 9, null);
    scheduled[0]?.();
    process.emit("exit", 9, null);

    expect(health.at(-1)).toEqual({
      available: false,
      message: "agent-server stopped after 1 restart attempts: agent-server exited with code 9",
    });
  });

  it("kills the child and emits unavailable health when readiness fails", async () => {
    const process = new FakeChildProcess();
    const health: Array<{ available: boolean; message?: string }> = [];
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      spawnProcess: () => process,
      scheduleRestart: vi.fn(),
      waitForReady: () => Promise.reject(new Error("port timeout")),
    });
    supervisor.onHealth((event) => health.push(event));

    supervisor.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(process.killed).toBe(true);
    expect(health.at(-1)).toEqual({
      available: false,
      message: "agent-server readiness failed: port timeout",
    });
  });
});

class FakeChildProcess extends EventEmitter implements AgentServerChildProcess {
  killed = false;
  stdout = new EventEmitter();
  stderr = new EventEmitter();

  kill(): void {
    this.killed = true;
  }
}

class Deferred<T> {
  promise: Promise<T>;
  private resolveValue?: (value: T | PromiseLike<T>) => void;

  constructor() {
    this.promise = new Promise<T>((resolve) => {
      this.resolveValue = resolve;
    });
  }

  resolve(value?: T): void {
    this.resolveValue?.(value as T);
  }
}
