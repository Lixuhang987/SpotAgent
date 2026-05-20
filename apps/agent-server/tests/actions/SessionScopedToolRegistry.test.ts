import { describe, expect, it } from "vitest";
import { ToolRegistry } from "@handagent/core/tools/ToolRegistry.ts";
import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import { SessionScopedToolRegistry } from "../../src/SessionScopedToolRegistry.ts";

describe("SessionScopedToolRegistry", () => {
  it("adds mcp tools only for sessions bound to their server", async () => {
    const builtin = new ToolRegistry([makeTool("clipboard.read")]);
    const scoped = new SessionScopedToolRegistry({
      builtinRegistry: builtin,
      listMcpTools: async (serverId) =>
        serverId === "github" ? [makeTool("mcp.github.create_issue")] : [],
    });

    await scoped.refreshForSession("plain", undefined);
    expect(scoped.registry.list().map((tool) => tool.name)).toEqual([
      "clipboard.read",
    ]);

    await scoped.refreshForSession("action", {
      pluginId: "review",
      promptName: "code_review",
      mcpServerIds: ["github"],
    });
    expect(scoped.registry.list().map((tool) => tool.name)).toEqual([
      "clipboard.read",
      "mcp.github.create_issue",
    ]);
  });

  it("skips missing mcp servers without dropping builtin tools", async () => {
    const logs: string[] = [];
    const builtin = new ToolRegistry([makeTool("clipboard.read")]);
    const scoped = new SessionScopedToolRegistry(
      {
        builtinRegistry: builtin,
        listMcpTools: async () => {
          throw new Error("Unknown MCP server: missing");
        },
      },
      { log: (message) => logs.push(message) },
    );

    await scoped.refreshForSession("action", {
      pluginId: "review",
      promptName: "code_review",
      mcpServerIds: ["missing"],
    });

    expect(scoped.registry.list().map((tool) => tool.name)).toEqual([
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
