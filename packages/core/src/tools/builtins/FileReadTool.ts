import { realpath, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve, relative, isAbsolute, sep } from "node:path";
import type { AgentTool } from "../AgentTool.ts";

export type FileReadToolInput = {
  path: string;
};

export type FileReadToolOutput = {
  path: string;
  content: string;
};

export class FileReadTool implements AgentTool<FileReadToolInput, FileReadToolOutput> {
  name = "file.read";
  description = "读取 workspace 内的文本文件";
  inputSchema = {
    type: "object",
    properties: {
      path: { type: "string" },
    },
    required: ["path"],
    additionalProperties: false,
  } as const;

  constructor(private readonly workspaceRoot: string) {}

  async call(input: FileReadToolInput): Promise<FileReadToolOutput> {
    const absolutePath = await resolveReadPathWithinWorkspace(this.workspaceRoot, input.path);
    const content = await readFile(absolutePath, "utf8");
    return {
      path: await normalizeWorkspaceRelativePath(this.workspaceRoot, absolutePath),
      content,
    };
  }
}

export async function resolveReadPathWithinWorkspace(
  workspaceRoot: string,
  targetPath: string
): Promise<string> {
  const absoluteRoot = await resolveWorkspaceRoot(workspaceRoot);
  const absoluteTarget = resolveCandidatePath(absoluteRoot, targetPath);
  ensureInsideWorkspace(absoluteRoot, absoluteTarget, targetPath);

  try {
    const resolvedTarget = await realpath(absoluteTarget);
    ensureInsideWorkspace(absoluteRoot, resolvedTarget, targetPath);
    return resolvedTarget;
  } catch (error) {
    if (isNotFoundError(error)) {
      return absoluteTarget;
    }

    throw error;
  }
}

export async function resolveWritePathWithinWorkspace(
  workspaceRoot: string,
  targetPath: string
): Promise<string> {
  const absoluteRoot = await resolveWorkspaceRoot(workspaceRoot);
  const absoluteTarget = resolveCandidatePath(absoluteRoot, targetPath);
  ensureInsideWorkspace(absoluteRoot, absoluteTarget, targetPath);

  const parentPath = dirname(absoluteTarget);
  const resolvedParent = await realpath(parentPath).catch(() => parentPath);
  ensureInsideWorkspace(absoluteRoot, resolvedParent, targetPath);

  return join(resolvedParent, basename(absoluteTarget));
}

export async function normalizeWorkspaceRelativePath(workspaceRoot: string, absolutePath: string): Promise<string> {
  const absoluteRoot = await resolveWorkspaceRoot(workspaceRoot);
  return relative(absoluteRoot, absolutePath);
}

async function resolveWorkspaceRoot(workspaceRoot: string): Promise<string> {
  if (!workspaceRoot) {
    throw new Error("workspaceRoot is required");
  }

  return realpath(workspaceRoot).catch(() => resolve(workspaceRoot));
}

function resolveCandidatePath(absoluteRoot: string, targetPath: string): string {
  return isAbsolute(targetPath) ? resolve(targetPath) : resolve(absoluteRoot, targetPath);
}

function ensureInsideWorkspace(absoluteRoot: string, absoluteTarget: string, targetPath: string): void {
  const relativePath = relative(absoluteRoot, absoluteTarget);
  const isInsideRoot = relativePath === "" || !relativePath.split(sep).some((segment) => segment === "..");

  if (!isInsideRoot) {
    throw new Error(`Path escapes workspace root: ${targetPath}`);
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
