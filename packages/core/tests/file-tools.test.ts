import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileReadTool } from "../src/tools/builtins/FileReadTool";
import { FileWriteTool } from "../src/tools/builtins/FileWriteTool";
import { FileWorkspaceRegistry } from "../src/workspace/FileWorkspaceRegistry";
import type { WorkspaceRegistry } from "../src/workspace/Workspace";

async function makeRegistryWithDefault(): Promise<{
  registry: WorkspaceRegistry;
  workspaceId: string;
  rootPath: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), "handagent-registry-"));
  const rootPath = join(dir, "ws");
  const registry = new FileWorkspaceRegistry({
    filePath: join(dir, "workspaces.json"),
    defaultRootPath: rootPath,
  });
  const def = await registry.getDefault();
  return { registry, workspaceId: def.id, rootPath };
}

describe("file tools", () => {
  it("writes and reads workspace files via workspaceId", async () => {
    const { registry, workspaceId } = await makeRegistryWithDefault();
    const writeTool = new FileWriteTool(registry);
    const readTool = new FileReadTool(registry);

    await writeTool.call({
      workspaceId,
      relativePath: "notes/today.md",
      content: "# 今日总结",
    });
    const result = await readTool.call({
      workspaceId,
      relativePath: "notes/today.md",
    });

    expect(result).toEqual({
      workspaceId,
      relativePath: "notes/today.md",
      content: "# 今日总结",
    });
  });

  it("rejects path escape attempts", async () => {
    const { registry, workspaceId } = await makeRegistryWithDefault();
    const writeTool = new FileWriteTool(registry);

    await expect(
      writeTool.call({ workspaceId, relativePath: "../outside.md", content: "nope" })
    ).rejects.toThrow("Path escapes workspace root");
  });

  it("rejects absolute relativePath", async () => {
    const { registry, workspaceId } = await makeRegistryWithDefault();
    const writeTool = new FileWriteTool(registry);

    await expect(
      writeTool.call({ workspaceId, relativePath: "/etc/passwd", content: "nope" })
    ).rejects.toThrow("relativePath must not be absolute");
  });

  it("rejects unknown workspaceId", async () => {
    const { registry } = await makeRegistryWithDefault();
    const writeTool = new FileWriteTool(registry);

    await expect(
      writeTool.call({
        workspaceId: "does-not-exist",
        relativePath: "x.md",
        content: "",
      })
    ).rejects.toThrow("workspace not found");
  });

  it("can write nested files by creating parent directories", async () => {
    const { registry, workspaceId, rootPath } = await makeRegistryWithDefault();
    const writeTool = new FileWriteTool(registry);

    const result = await writeTool.call({
      workspaceId,
      relativePath: "nested/dir/file.txt",
      content: "ok",
    });

    expect(result).toEqual({
      workspaceId,
      relativePath: "nested/dir/file.txt",
      bytesWritten: 2,
    });
    await expect(readFile(join(rootPath, "nested/dir/file.txt"), "utf8")).resolves.toBe("ok");
  });

  it("rejects symlink escape attempts", async () => {
    const { registry, workspaceId, rootPath } = await makeRegistryWithDefault();
    const outsideRoot = await mkdtemp(join(tmpdir(), "handagent-outside-"));
    await mkdir(rootPath, { recursive: true });
    await writeFile(join(outsideRoot, "secret.txt"), "top-secret", "utf8");
    await symlink(outsideRoot, join(rootPath, "linked-outside"));

    const readTool = new FileReadTool(registry);
    const writeTool = new FileWriteTool(registry);

    await expect(
      readTool.call({ workspaceId, relativePath: "linked-outside/secret.txt" })
    ).rejects.toThrow("Path escapes workspace root");
    await expect(
      writeTool.call({ workspaceId, relativePath: "linked-outside/new.txt", content: "nope" })
    ).rejects.toThrow("Path escapes workspace root");
  });

  it("refuses to write through a basename symlink that points outside the workspace", async () => {
    const { registry, workspaceId, rootPath } = await makeRegistryWithDefault();
    const outsideRoot = await mkdtemp(join(tmpdir(), "handagent-outside-basename-"));
    await mkdir(rootPath, { recursive: true });
    const outsideTarget = join(outsideRoot, "victim.txt");
    await writeFile(outsideTarget, "original", "utf8");
    await symlink(outsideTarget, join(rootPath, "trap.md"));

    const writeTool = new FileWriteTool(registry);

    await expect(
      writeTool.call({ workspaceId, relativePath: "trap.md", content: "pwn" })
    ).rejects.toThrow("Refuse to write through symlink");
    await expect(readFile(outsideTarget, "utf8")).resolves.toBe("original");
  });

  it("rejects writes that exceed the size cap", async () => {
    const { registry, workspaceId } = await makeRegistryWithDefault();
    const writeTool = new FileWriteTool(registry);
    const oversized = "x".repeat(10 * 1024 * 1024 + 1);

    await expect(
      writeTool.call({ workspaceId, relativePath: "big.txt", content: oversized })
    ).rejects.toThrow("exceeds");
  });
});
