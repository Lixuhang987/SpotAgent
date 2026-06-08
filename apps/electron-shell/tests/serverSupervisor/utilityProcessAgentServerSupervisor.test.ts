import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { UtilityProcessAgentServerSupervisor } from "../../src/main/serverSupervisor/utilityProcessAgentServerSupervisor.js";

describe("UtilityProcessAgentServerSupervisor", () => {
  it("forks the built agent-server entry with the supervised environment", () => {
    const utility = new FakeUtilityProcess();
    const fork = vi.fn(() => utility);
    const supervisor = new UtilityProcessAgentServerSupervisor({
      repoRoot: "/repo",
      entry: "/repo/apps/agent-server/dist/server/server.js",
      env: { HANDAGENT_LLM_MODE: "mock" },
      forkUtilityProcess: fork,
      waitForReady: () => Promise.resolve(),
    });

    supervisor.start();

    expect(fork).toHaveBeenCalledWith(
      "/repo/apps/agent-server/dist/server/server.js",
      [],
      {
        cwd: "/repo",
        env: expect.objectContaining({ HANDAGENT_LLM_MODE: "mock" }),
        stdio: "pipe",
        serviceName: "HandAgent agent-server",
      },
    );
  });

  it("describes utilityProcess as an agent-server core runtime host", () => {
    const supervisor = new UtilityProcessAgentServerSupervisor({
      repoRoot: "/repo",
      entry: "/repo/apps/agent-server/dist/server/server.js",
      env: {},
      forkUtilityProcess: () => new FakeUtilityProcess(),
      waitForReady: () => Promise.resolve(),
    });

    expect(supervisor.describe()).toEqual({
      mode: "utility_process",
      entry: "/repo/apps/agent-server/dist/server/server.js",
      coreRuntimeHost: "agent-server",
      utilityProcessBlocker: null,
    });
  });

  it("emits available health only after readiness resolves", async () => {
    const utility = new FakeUtilityProcess();
    const health: Array<{ available: boolean; message?: string }> = [];
    const ready = new Deferred<void>();
    const supervisor = new UtilityProcessAgentServerSupervisor({
      repoRoot: "/repo",
      entry: "/repo/apps/agent-server/dist/server/server.js",
      env: {},
      forkUtilityProcess: () => utility,
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

  it("kills the utility process and emits unavailable health on stop", () => {
    const utility = new FakeUtilityProcess();
    const health: Array<{ available: boolean; message?: string }> = [];
    const supervisor = new UtilityProcessAgentServerSupervisor({
      repoRoot: "/repo",
      entry: "/repo/apps/agent-server/dist/server/server.js",
      env: {},
      forkUtilityProcess: () => utility,
      waitForReady: () => Promise.resolve(),
    });
    supervisor.onHealth((event) => health.push(event));

    supervisor.start();
    supervisor.stop();

    expect(utility.killed).toBe(true);
    expect(health.at(-1)).toEqual({
      available: false,
      message: "agent-server stopped",
    });
  });

  it("reports fatal utility process errors", () => {
    const utility = new FakeUtilityProcess();
    const health: Array<{ available: boolean; message?: string }> = [];
    const supervisor = new UtilityProcessAgentServerSupervisor({
      repoRoot: "/repo",
      entry: "/repo/apps/agent-server/dist/server/server.js",
      env: {},
      forkUtilityProcess: () => utility,
      waitForReady: () => Promise.resolve(),
    });
    supervisor.onHealth((event) => health.push(event));

    supervisor.start();
    utility.emit("error", "FatalError", "server.js", "diagnostic report");

    expect(health.at(-1)).toEqual({
      available: false,
      message: "agent-server utility process error at server.js: diagnostic report",
    });
  });
});

class FakeUtilityProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
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
