import type { AgentTool } from "../AgentTool";
import type { PlatformAdapter } from "../../platform/PlatformAdapter";

export type ClipboardReadToolInput = Record<string, never>;

export type ClipboardReadToolOutput = {
  text: string | null;
};

export class ClipboardReadTool implements AgentTool<ClipboardReadToolInput, ClipboardReadToolOutput> {
  name = "clipboard.read";
  description = "读取当前剪贴板文本";
  inputSchema = {
    type: "object",
    properties: {},
    additionalProperties: false,
  } as const;

  constructor(private readonly platform: PlatformAdapter) {}

  async call(): Promise<ClipboardReadToolOutput> {
    return {
      text: await this.platform.currentClipboardText(),
    };
  }
}
