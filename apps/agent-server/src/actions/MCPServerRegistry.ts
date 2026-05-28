import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import type {
  MCPClient,
  MCPPromptDescription,
  MCPGetPromptResult,
  MCPResourceDescription,
  MCPReadResourceResult,
  MCPServerInfo,
} from "@handagent/core/mcp/MCPClient.ts";
import { MCPToolAdapter } from "@handagent/core/mcp/MCPToolAdapter.ts";

export class MCPServerRegistry {
  private readonly clients = new Map<string, MCPClient>();
  private readonly toolCache = new Map<string, AgentTool[]>();

  constructor(
    private readonly options: {
      createClient: (serverId: string) => MCPClient;
    },
  ) {}

  async getClient(serverId: string): Promise<MCPClient> {
    let client = this.clients.get(serverId);
    if (!client) {
      client = this.options.createClient(serverId);
      await client.initialize();
      this.clients.set(serverId, client);
    }
    return client;
  }

  getServerInfo(serverId: string): MCPServerInfo | undefined {
    return this.clients.get(serverId)?.serverInfo();
  }

  async listTools(serverId: string): Promise<AgentTool[]> {
    const cached = this.toolCache.get(serverId);
    if (cached) return cached;

    const client = await this.getClient(serverId);
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

  async listPrompts(serverId: string): Promise<MCPPromptDescription[]> {
    const client = await this.getClient(serverId);
    return client.listPrompts();
  }

  async getPrompt(
    serverId: string,
    name: string,
    args?: Record<string, string>,
  ): Promise<MCPGetPromptResult> {
    const client = await this.getClient(serverId);
    return client.getPrompt(name, args);
  }

  async listResources(serverId: string): Promise<MCPResourceDescription[]> {
    const client = await this.getClient(serverId);
    return client.listResources();
  }

  async readResource(serverId: string, uri: string): Promise<MCPReadResourceResult> {
    const client = await this.getClient(serverId);
    return client.readResource(uri);
  }

  async closeAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.close();
    }
    this.clients.clear();
    this.toolCache.clear();
  }
}
