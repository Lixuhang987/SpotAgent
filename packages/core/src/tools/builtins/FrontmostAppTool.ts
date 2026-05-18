import { z } from "zod";
import { defineTool } from "../defineTool.ts";
import type { PlatformAdapter } from "../../platform/PlatformAdapter.ts";

const InputSchema = z.object({});

export type FrontmostAppToolOutput = Awaited<ReturnType<PlatformAdapter["frontmostAppInfo"]>>;

export const FrontmostAppTool = defineTool<z.infer<typeof InputSchema>, FrontmostAppToolOutput, PlatformAdapter>({
  name: "app.frontmost",
  description: "读取当前前台 App 信息",
  inputSchema: InputSchema,
  run: async (_input, platform) => platform.frontmostAppInfo(),
});
