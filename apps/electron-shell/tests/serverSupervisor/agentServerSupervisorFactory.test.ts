import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createAgentServerSupervisor } from "../../src/main/serverSupervisor/agentServerSupervisorFactory.js";
import type { AgentServerChildProcess } from "../../src/main/serverSupervisor/nodeAgentServerSupervisor.js";
import type { UtilityProcessLike } from "../../src/main/serverSupervisor/utilityProcessAgentServerSupervisor.js";

describe("createAgentServerSupervisor", () => {
  it("prefers utilityProcess when a JS entry exists", () => {
    const supervisor = createAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      fileExists: (path) => path === "/repo/apps/agent-server/dist/server/server.js",
      forkUtilityProcess: () => new FakeUtilityProcess(),
      waitForReady: () => Promise.resolve(),
    });

    expect(supervisor.describe()).toMatchObject({
      mode: "utility_process",
      entry: "/repo/apps/agent-server/dist/server/server.js",
      coreRuntimeHost: "agent-server",
      utilityProcessBlocker: null,
    });
  });

  it("falls back to Node child process and exposes the utilityProcess blocker", () => {
    const supervisor = createAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      fileExists: () => false,
      spawnProcess: () => new FakeChildProcess(),
      waitForReady: () => Promise.resolve(),
    });

    expect(supervisor.describe()).toMatchObject({
      mode: "node_child",
      entry: "apps/agent-server/src/server/server.ts",
      coreRuntimeHost: "agent-server",
      utilityProcessBlocker: "apps/agent-server/dist/server/server.js 不存在；当前 agent-server 仍依赖 TypeScript 源码入口和 Node --experimental-transform-types",
    });
  });
});

class FakeUtilityProcess extends EventEmitter implements UtilityProcessLike {
  stdout = null;
  stderr = null;

  kill(): boolean {
    return true;
  }
}

class FakeChildProcess extends EventEmitter implements AgentServerChildProcess {
  stdout = null;
  stderr = null;

  kill(): void {}
}
