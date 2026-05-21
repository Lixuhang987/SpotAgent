import type { AgentTool } from "../tools/AgentTool.ts";
import type { MCPCallToolResult, MCPToolDescription } from "./MCPClient.ts";

export class MCPToolAdapter
  implements AgentTool<Record<string, unknown>, MCPCallToolResult>
{
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;

  constructor(
    private readonly options: {
      serverId: string;
      tool: MCPToolDescription;
      callTool: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<MCPCallToolResult>;
    },
  ) {
    this.name = `mcp.${options.serverId}.${options.tool.name}`;
    this.description = `[mcp:${options.serverId}] ${
      options.tool.description ?? options.tool.name
    }`;
    this.inputSchema = options.tool.inputSchema ?? { type: "object" };
  }

  call(input: Record<string, unknown>): Promise<MCPCallToolResult> {
    return this.options.callTool(this.options.tool.name, input);
  }
}
