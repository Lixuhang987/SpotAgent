import type { AgentTool } from "../AgentTool";
import type { PlatformAdapter } from "../../platform/PlatformAdapter";

export type FrontmostAppToolInput = Record<string, never>;
export type FrontmostAppToolOutput = Awaited<ReturnType<PlatformAdapter["frontmostAppInfo"]>>;

export class FrontmostAppTool implements AgentTool<FrontmostAppToolInput, FrontmostAppToolOutput> {
  name = "app.frontmost";
  description = "读取当前前台 App 信息";
  inputSchema = {
    type: "object",
    properties: {},
    additionalProperties: false,
  } as const;

  constructor(private readonly platform: PlatformAdapter) {}

  async call(): Promise<FrontmostAppToolOutput> {
    return this.platform.frontmostAppInfo();
  }
}
