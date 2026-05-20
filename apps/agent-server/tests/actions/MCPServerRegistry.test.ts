import { describe, expect, it } from "vitest";
import type { MCPClient } from "@handagent/core/mcp/MCPClient.ts";
import { MCPServerRegistry } from "../../src/MCPServerRegistry.ts";

describe("MCPServerRegistry", () => {
  it("caches tools per server id", async () => {
    let createCount = 0;
    const registry = new MCPServerRegistry({
      createClient: (serverId) => {
        createCount += 1;
        return makeClient(serverId);
      },
    });

    await expect(registry.listTools("github")).resolves.toHaveLength(1);
    await expect(registry.listTools("github")).resolves.toHaveLength(1);
    expect(createCount).toBe(1);
  });
});

function makeClient(serverId: string): MCPClient {
  return {
    async initialize() {},
    async listTools() {
      return [
        {
          name: "create_issue",
          description: serverId,
          inputSchema: { type: "object" },
        },
      ];
    },
    async callTool() {
      return { content: [{ type: "text", text: "ok" }] };
    },
    async close() {},
  };
}
