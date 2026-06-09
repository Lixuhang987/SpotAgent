import { describe, expect, it } from "vitest";
import { ToolRegistry } from "@handagent/core/tools/ToolRegistry.ts";
import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import { ThreadScopedToolRegistry } from "../../src/actions/ThreadScopedToolRegistry.ts";

describe("ThreadScopedToolRegistry", () => {
  it("adds mcp tools only for Threads bound to their server (after activation)", async () => {
    const builtin = new ToolRegistry([makeTool("clipboard.read")]);
    const scoped = new ThreadScopedToolRegistry({
      builtinRegistry: builtin,
      globalMcpServerIds: [],
      listMcpTools: async (serverId) =>
        serverId === "github" ? [makeTool("mcp.github.create_issue")] : [],
    });

    // plain Thread without binding stays meta-only
    await scoped.refreshForThread("plain", undefined);
    expect(scoped.registryForThread("plain").list().map((tool) => tool.name)).toEqual([
      "use_tools",
    ]);

    // Thread with plugin binding gets activated immediately with full tools
    await scoped.refreshForThread("action", {
      pluginId: "review",
      promptName: "code_review",
      mcpServerIds: ["github"],
    });
    expect(scoped.registryForThread("action").list().map((tool) => tool.name)).toEqual([
      "clipboard.read",
      "mcp.github.create_issue",
    ]);
  });

  it("loads global mcp servers for activated Threads", async () => {
    const builtin = new ToolRegistry([makeTool("clipboard.read")]);
    const scoped = new ThreadScopedToolRegistry({
      builtinRegistry: builtin,
      globalMcpServerIds: ["github"],
      listMcpTools: async (serverId) =>
        serverId === "github" ? [makeTool("mcp.github.create_issue")] : [],
    });

    // before activation: meta-only (global MCP servers are not loaded until activated)
    await scoped.refreshForThread("plain", undefined);
    expect(scoped.registryForThread("plain").list().map((tool) => tool.name)).toEqual([
      "use_tools",
    ]);

    // after explicit activation: builtin + global MCP without the meta-tool
    await scoped.activate("plain");
    expect(scoped.registryForThread("plain").list().map((tool) => tool.name)).toEqual([
      "clipboard.read",
      "mcp.github.create_issue",
    ]);
  });

  it("deduplicates when global and binding reference the same server", async () => {
    const builtin = new ToolRegistry([makeTool("clipboard.read")]);
    const scoped = new ThreadScopedToolRegistry({
      builtinRegistry: builtin,
      globalMcpServerIds: ["github"],
      listMcpTools: async (serverId) =>
        serverId === "github" ? [makeTool("mcp.github.create_issue")] : [],
    });

    await scoped.refreshForThread("action", {
      pluginId: "review",
      promptName: "code_review",
      mcpServerIds: ["github"],
    });
    expect(scoped.registryForThread("action").list().map((tool) => tool.name)).toEqual([
      "clipboard.read",
      "mcp.github.create_issue",
    ]);
  });

  it("skips missing mcp servers without dropping builtin tools (activated Thread)", async () => {
    const logs: string[] = [];
    const builtin = new ToolRegistry([makeTool("clipboard.read")]);
    const scoped = new ThreadScopedToolRegistry(
      {
        builtinRegistry: builtin,
        globalMcpServerIds: ["missing"],
        listMcpTools: async () => {
          throw new Error("Unknown MCP server: missing");
        },
      },
      { log: (message) => logs.push(message) },
    );

    // use activate() to trigger full tool load; MCP error should be swallowed
    await scoped.activate("action");

    expect(scoped.registryForThread("action").list().map((tool) => tool.name)).toEqual([
      "clipboard.read",
    ]);
    expect(logs[0]).toContain("skipped MCP server missing");
  });
});

function makeTool(name: string): AgentTool {
  return {
    name,
    description: name,
    inputSchema: { type: "object" },
    async call() {
      return {};
    },
  };
}
