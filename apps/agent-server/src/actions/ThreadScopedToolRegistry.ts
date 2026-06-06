import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import { ToolRegistry } from "@handagent/core/tools/ToolRegistry.ts";
import type { ThreadActionBinding } from "@handagent/core/storage/index.ts";
import { MetaToolUseTool } from "@handagent/core/tools/MetaToolUseTool.ts";

export class ThreadScopedToolRegistry {
  private readonly metaTool: AgentTool = MetaToolUseTool.create();
  private readonly activated = new Set<string>();
  private readonly registries = new Map<string, ToolRegistry>();

  constructor(
    private readonly options: {
      builtinRegistry: ToolRegistry;
      globalMcpServerIds: string[];
      listMcpTools: (serverId: string) => Promise<AgentTool[]>;
      exposeBuiltinToolsBeforeActivation?: boolean;
    },
    private readonly dependencies: {
      log?: (message: string) => void;
    } = {},
  ) {}

  async refreshForThread(
    threadId: string,
    binding: ThreadActionBinding | undefined,
  ): Promise<void> {
    const registry = this.registryForThread(threadId);
    if (binding) {
      this.activated.add(threadId);
    }
    if (this.activated.has(threadId)) {
      await this.refreshActivated(threadId, binding, registry);
      return;
    }
    if (this.options.exposeBuiltinToolsBeforeActivation) {
      this.replaceWithUniqueTools(registry, [
        this.metaTool,
        ...this.options.builtinRegistry.all(),
      ]);
      return;
    }
    registry.replaceAll([this.metaTool]);
  }

  async activate(threadId: string): Promise<void> {
    this.activated.add(threadId);
    await this.refreshActivated(threadId, undefined, this.registryForThread(threadId));
  }

  isActivated(threadId: string): boolean {
    return this.activated.has(threadId);
  }

  registryForThread(threadId: string): ToolRegistry {
    let registry = this.registries.get(threadId);
    if (!registry) {
      registry = new ToolRegistry([this.metaTool]);
      this.registries.set(threadId, registry);
    }
    return registry;
  }

  forgetThread(threadId: string): void {
    this.activated.delete(threadId);
    this.registries.delete(threadId);
  }

  private async refreshActivated(
    threadId: string,
    binding: ThreadActionBinding | undefined,
    registry: ToolRegistry,
  ): Promise<void> {
    void threadId;
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

    this.replaceWithUniqueTools(registry, tools);
  }

  private replaceWithUniqueTools(registry: ToolRegistry, tools: AgentTool[]): void {
    const byName = new Map<string, AgentTool>();
    for (const tool of tools) {
      if (!byName.has(tool.name)) {
        byName.set(tool.name, tool);
      }
    }
    registry.replaceAll([...byName.values()]);
  }
}
