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

  it("emits unavailable health on non-zero exit", () => {
    const process = new FakeChildProcess();
    const health: Array<{ available: boolean; message?: string }> = [];
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
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
      spawnProcess: () => process,
      scheduleRestart,
    });

    supervisor.start();
    supervisor.stop();
    process.emit("exit", 0, null);

    expect(process.killed).toBe(true);
    expect(scheduleRestart).not.toHaveBeenCalled();
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
