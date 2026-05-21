import type { AgentTool } from "./AgentTool.ts";

export type RegisteredTool = Pick<AgentTool, "name" | "description" | "inputSchema">;

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  constructor(tools: AgentTool[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  replaceAll(tools: AgentTool[]): void {
    this.tools.clear();
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  all(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  list(): RegisteredTool[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }
}
