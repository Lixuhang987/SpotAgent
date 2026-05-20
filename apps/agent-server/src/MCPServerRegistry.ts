import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import type { MCPClient } from "@handagent/core/mcp/MCPClient.ts";
import { MCPToolAdapter } from "@handagent/core/mcp/MCPToolAdapter.ts";

export class MCPServerRegistry {
  private readonly clients = new Map<string, MCPClient>();
  private readonly toolCache = new Map<string, AgentTool[]>();

  constructor(
    private readonly options: {
      createClient: (serverId: string) => MCPClient;
    },
  ) {}

  async listTools(serverId: string): Promise<AgentTool[]> {
    const cached = this.toolCache.get(serverId);
    if (cached) return cached;

    let client = this.clients.get(serverId);
    if (!client) {
      client = this.options.createClient(serverId);
      await client.initialize();
      this.clients.set(serverId, client);
    }

    const tools = (await client.listTools()).map(
      (tool) =>
        new MCPToolAdapter({
          serverId,
          tool,
          callTool: (name, args) => client.callTool(name, args),
        }),
    );
    this.toolCache.set(serverId, tools);
    return tools;
  }
}
