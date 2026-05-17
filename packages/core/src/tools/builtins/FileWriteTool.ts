import { lstat, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
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

export const FILE_WRITE_MAX_BYTES = 10 * 1024 * 1024;

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
    const bytesWritten = Buffer.byteLength(input.content, "utf8");
    if (bytesWritten > FILE_WRITE_MAX_BYTES) {
      throw new Error(
        `File content exceeds ${FILE_WRITE_MAX_BYTES} byte limit: ${bytesWritten} bytes`,
      );
    }

    const workspace = await resolveWorkspace(this.registry, input.workspaceId);
    const absolutePath = await resolveWritePathWithinWorkspace(
      workspace.rootPath,
      input.relativePath,
    );

    await ensureTargetIsNotSymlink(absolutePath, input.relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await atomicWriteFile(absolutePath, input.content);

    return {
      workspaceId: workspace.id,
      relativePath: await normalizeWorkspaceRelativePath(workspace.rootPath, absolutePath),
      bytesWritten,
    };
  }
}

async function ensureTargetIsNotSymlink(absolutePath: string, relativePath: string): Promise<void> {
  try {
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`Refuse to write through symlink at target: ${relativePath}`);
    }
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }
    throw error;
  }
}

async function atomicWriteFile(absolutePath: string, content: string): Promise<void> {
  const tempPath = `${absolutePath}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(tempPath, content, { encoding: "utf8", flag: "wx" });
    await rename(tempPath, absolutePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
