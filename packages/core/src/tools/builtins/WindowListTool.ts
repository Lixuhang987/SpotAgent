import type { AgentTool } from "../AgentTool.ts";
import type { PlatformAdapter } from "../../platform/PlatformAdapter.ts";

export type WindowListToolInput = Record<string, never>;
export type WindowListToolOutput = Awaited<ReturnType<PlatformAdapter["frontmostWindowList"]>>;

export class WindowListTool implements AgentTool<WindowListToolInput, WindowListToolOutput> {
  name = "window.list";
  description = "读取当前窗口列表";
  inputSchema = {
    type: "object",
    properties: {},
    additionalProperties: false,
  } as const;

  constructor(private readonly platform: PlatformAdapter) {}

  async call(): Promise<WindowListToolOutput> {
    return this.platform.frontmostWindowList();
  }
}
