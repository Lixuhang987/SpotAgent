import { z } from "zod";
import { defineTool } from "../defineTool.ts";
import type { PlatformAdapter } from "../../platform/PlatformAdapter.ts";

const InputSchema = z.object({});

export type ClipboardReadToolOutput = { text: string | null };

export const ClipboardReadTool = defineTool<z.infer<typeof InputSchema>, ClipboardReadToolOutput, PlatformAdapter>({
  name: "clipboard.read",
  description: "读取当前剪贴板文本",
  inputSchema: InputSchema,
  run: async (_input, platform) => ({
    text: await platform.currentClipboardText(),
  }),
});
