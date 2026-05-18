import { readFile } from "node:fs/promises";
import { z } from "zod";
import { defineTool } from "../defineTool.ts";
import type { WorkspaceRegistry } from "../../workspace/Workspace.ts";
import {
  normalizeWorkspaceRelativePath,
  resolveReadPathWithinWorkspace,
  resolveWorkspace,
} from "./workspace-path.ts";

const InputSchema = z.object({
  workspaceId: z.string().describe("目标 workspace 的 id"),
  relativePath: z.string().describe("相对 workspace rootPath 的路径，禁止使用绝对路径"),
});

export type FileReadToolInput = z.infer<typeof InputSchema>;
export type FileReadToolOutput = { workspaceId: string; relativePath: string; content: string };

export const FileReadTool = defineTool<FileReadToolInput, FileReadToolOutput, WorkspaceRegistry>({
  name: "file.read",
  description:
    "读取指定 workspace 内的文本文件。调用前若不确定 workspace，先调 `workspace.list`，匹配模糊时调 `workspace.askUser`。",
  inputSchema: InputSchema,
  run: async (input, registry): Promise<FileReadToolOutput> => {
    const workspace = await resolveWorkspace(registry, input.workspaceId);
    const absolutePath = await resolveReadPathWithinWorkspace(workspace.rootPath, input.relativePath);
    const content = await readFile(absolutePath, "utf8");
    return {
      workspaceId: workspace.id,
      relativePath: await normalizeWorkspaceRelativePath(workspace.rootPath, absolutePath),
      content,
    };
  },
});
