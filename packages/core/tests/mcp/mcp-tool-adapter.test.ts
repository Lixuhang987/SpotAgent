import { describe, expect, it } from "vitest";
import { MCPToolAdapter } from "../../src/mcp/MCPToolAdapter.ts";

describe("MCPToolAdapter", () => {
  it("exposes server-prefixed tool names and calls original MCP tool", async () => {
    const calls: unknown[] = [];
    const adapter = new MCPToolAdapter({
      serverId: "github",
      tool: {
        name: "create_issue",
        description: "Create issue",
        inputSchema: { type: "object" },
      },
      callTool: async (name, args) => {
        calls.push({ name, args });
        return { content: [{ type: "text", text: "created" }] };
      },
    });

    expect(adapter.name).toBe("mcp.github.create_issue");
    await expect(adapter.call({ title: "Bug" })).resolves.toEqual({
      content: [{ type: "text", text: "created" }],
    });
    expect(calls).toEqual([{ name: "create_issue", args: { title: "Bug" } }]);
  });
});
