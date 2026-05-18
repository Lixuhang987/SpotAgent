import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Workspace, WorkspaceRegistry } from "../../workspace/Workspace.ts";

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

export function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
