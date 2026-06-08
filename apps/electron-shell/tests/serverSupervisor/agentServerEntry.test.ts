import { describe, expect, it } from "vitest";
import { resolveAgentServerEntry } from "../../src/main/serverSupervisor/agentServerEntry.js";

describe("resolveAgentServerEntry", () => {
  it("selects a utilityProcess JS entry when it exists", () => {
    const entry = resolveAgentServerEntry({
      repoRoot: "/repo",
      fileExists: (path) => path === "/repo/apps/agent-server/dist/server/server.js",
    });

    expect(entry.utilityProcessEntry).toBe("/repo/apps/agent-server/dist/server/server.js");
    expect(entry.utilityProcessBlocker).toBeNull();
    expect(entry.nodeChildEntry).toBe("apps/agent-server/src/server/server.ts");
  });

  it("records the concrete utilityProcess blocker when no JS entry exists", () => {
    const entry = resolveAgentServerEntry({
      repoRoot: "/repo",
      fileExists: () => false,
    });

    expect(entry.utilityProcessEntry).toBeNull();
    expect(entry.utilityProcessBlocker).toBe(
      "apps/agent-server/dist/server/server.js 不存在；当前 agent-server 仍依赖 TypeScript 源码入口和 Node --experimental-transform-types",
    );
    expect(entry.nodeChildEntry).toBe("apps/agent-server/src/server/server.ts");
  });
});
