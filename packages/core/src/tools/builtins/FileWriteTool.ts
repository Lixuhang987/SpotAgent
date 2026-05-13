import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentTool } from "../AgentTool.ts";
import {
  normalizeWorkspaceRelativePath,
  resolveWritePathWithinWorkspace,
} from "./FileReadTool.ts";

export type FileWriteToolInput = {
  path: string;
  content: string;
};

export type FileWriteToolOutput = {
  path: string;
  bytesWritten: number;
};

export class FileWriteTool implements AgentTool<FileWriteToolInput, FileWriteToolOutput> {
  name = "file.write";
  description = "写入 workspace 内的文本文件";
  inputSchema = {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
    additionalProperties: false,
  } as const;

  constructor(private readonly workspaceRoot: string) {}

  async call(input: FileWriteToolInput): Promise<FileWriteToolOutput> {
    const absolutePath = await resolveWritePathWithinWorkspace(this.workspaceRoot, input.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.content, "utf8");
    return {
      path: await normalizeWorkspaceRelativePath(this.workspaceRoot, absolutePath),
      bytesWritten: Buffer.byteLength(input.content, "utf8"),
    };
  }
}
