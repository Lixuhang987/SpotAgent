import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import { ToolRegistry } from "@handagent/core/tools/ToolRegistry.ts";
import type { SessionActionBinding } from "@handagent/core/storage/index.ts";
import { MetaToolUseTool } from "@handagent/core/tools/MetaToolUseTool.ts";

export class SessionScopedToolRegistry {
  private readonly metaTool: AgentTool = MetaToolUseTool.create();
  private readonly activated = new Set<string>();
  private readonly registries = new Map<string, ToolRegistry>();

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
    const registry = this.registryForSession(sessionId);
    if (binding) {
      this.activated.add(sessionId);
    }
    if (this.activated.has(sessionId)) {
      await this.refreshActivated(sessionId, binding, registry);
      return;
    }
    registry.replaceAll([this.metaTool]);
  }

  async activate(sessionId: string): Promise<void> {
    this.activated.add(sessionId);
    await this.refreshActivated(sessionId, undefined, this.registryForSession(sessionId));
  }

  isActivated(sessionId: string): boolean {
    return this.activated.has(sessionId);
  }

  registryForSession(sessionId: string): ToolRegistry {
    let registry = this.registries.get(sessionId);
    if (!registry) {
      registry = new ToolRegistry([this.metaTool]);
      this.registries.set(sessionId, registry);
    }
    return registry;
  }

  forgetSession(sessionId: string): void {
    this.activated.delete(sessionId);
    this.registries.delete(sessionId);
  }

  private async refreshActivated(
    sessionId: string,
    binding: SessionActionBinding | undefined,
    registry: ToolRegistry,
  ): Promise<void> {
    void sessionId;
    const tools: AgentTool[] = [this.metaTool, ...this.options.builtinRegistry.all()];

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
    registry.replaceAll([...byName.values()]);
  }
}
