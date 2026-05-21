import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import { ToolRegistry } from "@handagent/core/tools/ToolRegistry.ts";
import type { SessionActionBinding } from "@handagent/core/storage/index.ts";

export class SessionScopedToolRegistry {
  readonly registry = new ToolRegistry();

  constructor(
    private readonly options: {
      builtinRegistry: ToolRegistry;
      globalMcpServerIds: string[];
      listMcpTools: (serverId: string) => Promise<AgentTool[]>;
    },
    private readonly dependencies: {
      log?: (message: string) => void;
    } = {},
  ) {}

  async refreshForSession(
    sessionId: string,
    binding: SessionActionBinding | undefined,
  ): Promise<void> {
    void sessionId;
    const tools: AgentTool[] = [...this.options.builtinRegistry.all()];

    const serverIds = new Set([
      ...this.options.globalMcpServerIds,
      ...(binding?.mcpServerIds ?? []),
    ]);

    for (const serverId of serverIds) {
      try {
        tools.push(...(await this.options.listMcpTools(serverId)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.dependencies.log?.(
          `[agent-server] skipped MCP server ${serverId}: ${message}`,
        );
      }
    }

    const byName = new Map<string, AgentTool>();
    for (const tool of tools) {
      if (!byName.has(tool.name)) {
        byName.set(tool.name, tool);
      }
    }
    this.registry.replaceAll([...byName.values()]);
  }
}
