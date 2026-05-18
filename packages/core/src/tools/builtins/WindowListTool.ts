import { z } from "zod";
import { defineTool } from "../defineTool.ts";
import type { PlatformAdapter } from "../../platform/PlatformAdapter.ts";

const InputSchema = z.object({});

export type WindowListToolOutput = Awaited<ReturnType<PlatformAdapter["frontmostWindowList"]>>;

export const WindowListTool = defineTool<z.infer<typeof InputSchema>, WindowListToolOutput, PlatformAdapter>({
  name: "window.list",
  description: "读取当前窗口列表",
  inputSchema: InputSchema,
  run: async (_input, platform) => platform.frontmostWindowList(),
});
