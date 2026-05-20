import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import { ToolRegistry } from "@handagent/core/tools/ToolRegistry.ts";
import type { SessionActionBinding } from "@handagent/core/storage/index.ts";

export class SessionScopedToolRegistry {
  readonly registry = new ToolRegistry();

  constructor(
    private readonly options: {
      builtinRegistry: ToolRegistry;
      listMcpTools: (serverId: string) => Promise<AgentTool[]>;
    },
  ) {}

  async refreshForSession(
    sessionId: string,
    binding: SessionActionBinding | undefined,
  ): Promise<void> {
    void sessionId;
    const tools: AgentTool[] = [...this.options.builtinRegistry.all()];

    for (const serverId of binding?.mcpServerIds ?? []) {
      tools.push(...(await this.options.listMcpTools(serverId)));
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
