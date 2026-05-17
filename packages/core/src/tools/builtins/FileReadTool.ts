import { realpath, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AgentTool } from "../AgentTool.ts";
import type { WorkspaceRegistry, Workspace } from "../../workspace/Workspace.ts";

export type FileReadToolInput = {
  workspaceId: string;
  relativePath: string;
};

export type FileReadToolOutput = {
  workspaceId: string;
  relativePath: string;
  content: string;
};

export class FileReadTool implements AgentTool<FileReadToolInput, FileReadToolOutput> {
  name = "file.read";
  description =
    "读取指定 workspace 内的文本文件。调用前若不确定 workspace，先调 `workspace.list`，匹配模糊时调 `workspace.askUser`。";
  inputSchema = {
    type: "object",
    properties: {
      workspaceId: { type: "string", description: "目标 workspace 的 id" },
      relativePath: {
        type: "string",
        description: "相对 workspace rootPath 的路径，禁止使用绝对路径",
      },
    },
    required: ["workspaceId", "relativePath"],
    additionalProperties: false,
  } as const;

  constructor(private readonly registry: WorkspaceRegistry) {}

  async call(input: FileReadToolInput): Promise<FileReadToolOutput> {
    const workspace = await resolveWorkspace(this.registry, input.workspaceId);
    const absolutePath = await resolveReadPathWithinWorkspace(
      workspace.rootPath,
      input.relativePath,
    );
    const content = await readFile(absolutePath, "utf8");
    return {
      workspaceId: workspace.id,
      relativePath: await normalizeWorkspaceRelativePath(workspace.rootPath, absolutePath),
      content,
    };
  }
}

export async function resolveWorkspace(
  registry: WorkspaceRegistry,
  workspaceId: string,
): Promise<Workspace> {
  const workspace = await registry.get(workspaceId);
  if (!workspace) {
    throw new Error(`workspace not found: ${workspaceId}`);
  }
  return workspace;
}

export async function resolveReadPathWithinWorkspace(
  workspaceRoot: string,
  targetPath: string,
): Promise<string> {
  ensureRelativePath(targetPath);
  const absoluteRoot = await resolveWorkspaceRoot(workspaceRoot);
  const absoluteTarget = resolve(absoluteRoot, targetPath);
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
  targetPath: string,
): Promise<string> {
  ensureRelativePath(targetPath);
  const absoluteRoot = await resolveWorkspaceRoot(workspaceRoot);
  const absoluteTarget = resolve(absoluteRoot, targetPath);
  ensureInsideWorkspace(absoluteRoot, absoluteTarget, targetPath);

  const parentPath = dirname(absoluteTarget);
  const resolvedParent = await realpath(parentPath).catch(() => parentPath);
  ensureInsideWorkspace(absoluteRoot, resolvedParent, targetPath);

  return join(resolvedParent, basename(absoluteTarget));
}

export async function normalizeWorkspaceRelativePath(
  workspaceRoot: string,
  absolutePath: string,
): Promise<string> {
  const absoluteRoot = await resolveWorkspaceRoot(workspaceRoot);
  return relative(absoluteRoot, absolutePath);
}

async function resolveWorkspaceRoot(workspaceRoot: string): Promise<string> {
  if (!workspaceRoot) {
    throw new Error("workspaceRoot is required");
  }

  return realpath(workspaceRoot).catch(() => resolve(workspaceRoot));
}

function ensureRelativePath(targetPath: string): void {
  if (isAbsolute(targetPath)) {
    throw new Error(`relativePath must not be absolute: ${targetPath}`);
  }
}

function ensureInsideWorkspace(
  absoluteRoot: string,
  absoluteTarget: string,
  targetPath: string,
): void {
  const relativePath = relative(absoluteRoot, absoluteTarget);
  const isInsideRoot =
    relativePath === "" || !relativePath.split(sep).some((segment) => segment === "..");

  if (!isInsideRoot) {
    throw new Error(`Path escapes workspace root: ${targetPath}`);
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
