import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentTool } from "../AgentTool.ts";
import type { WorkspaceRegistry } from "../../workspace/Workspace.ts";
import {
  normalizeWorkspaceRelativePath,
  resolveWorkspace,
  resolveWritePathWithinWorkspace,
} from "./FileReadTool.ts";

export type FileWriteToolInput = {
  workspaceId: string;
  relativePath: string;
  content: string;
};

export type FileWriteToolOutput = {
  workspaceId: string;
  relativePath: string;
  bytesWritten: number;
};

export class FileWriteTool implements AgentTool<FileWriteToolInput, FileWriteToolOutput> {
  name = "file.write";
  description =
    "写入指定 workspace 内的文本文件。调用前若不确定 workspace，先调 `workspace.list`，匹配模糊时调 `workspace.askUser`。";
  inputSchema = {
    type: "object",
    properties: {
      workspaceId: { type: "string", description: "目标 workspace 的 id" },
      relativePath: {
        type: "string",
        description: "相对 workspace rootPath 的路径，禁止使用绝对路径",
      },
      content: { type: "string" },
    },
    required: ["workspaceId", "relativePath", "content"],
    additionalProperties: false,
  } as const;

  constructor(private readonly registry: WorkspaceRegistry) {}

  async call(input: FileWriteToolInput): Promise<FileWriteToolOutput> {
    const workspace = await resolveWorkspace(this.registry, input.workspaceId);
    const absolutePath = await resolveWritePathWithinWorkspace(
      workspace.rootPath,
      input.relativePath,
    );
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.content, "utf8");
    return {
      workspaceId: workspace.id,
      relativePath: await normalizeWorkspaceRelativePath(workspace.rootPath, absolutePath),
      bytesWritten: Buffer.byteLength(input.content, "utf8"),
    };
  }
}
