import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileReadTool } from "../src/tools/builtins/FileReadTool";
import { FileWriteTool } from "../src/tools/builtins/FileWriteTool";

describe("file tools", () => {
  it("writes and reads workspace files", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "handagent-workspace-"));
    const writeTool = new FileWriteTool(workspaceRoot);
    const readTool = new FileReadTool(workspaceRoot);

    await writeTool.call({ path: "notes/today.md", content: "# 今日总结" });
    const result = await readTool.call({ path: "notes/today.md" });

    expect(result).toEqual({
      path: "notes/today.md",
      content: "# 今日总结",
    });
  });

  it("rejects path escape attempts", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "handagent-workspace-"));
    const writeTool = new FileWriteTool(workspaceRoot);

    await expect(writeTool.call({ path: "../outside.md", content: "nope" })).rejects.toThrow(
      "Path escapes workspace root"
    );
  });

  it("can write nested files by creating parent directories", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "handagent-workspace-"));
    const writeTool = new FileWriteTool(workspaceRoot);

    const result = await writeTool.call({ path: "nested/dir/file.txt", content: "ok" });

    expect(result).toEqual({
      path: "nested/dir/file.txt",
      bytesWritten: 2,
    });
    await expect(readFile(join(workspaceRoot, "nested/dir/file.txt"), "utf8")).resolves.toBe("ok");
  });

  it("rejects symlink escape attempts", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "handagent-workspace-"));
    const outsideRoot = await mkdtemp(join(tmpdir(), "handagent-outside-"));
    await writeFile(join(outsideRoot, "secret.txt"), "top-secret", "utf8");
    await symlink(outsideRoot, join(workspaceRoot, "linked-outside"));

    const readTool = new FileReadTool(workspaceRoot);
    const writeTool = new FileWriteTool(workspaceRoot);

    await expect(readTool.call({ path: "linked-outside/secret.txt" })).rejects.toThrow(
      "Path escapes workspace root"
    );
    await expect(writeTool.call({ path: "linked-outside/new.txt", content: "nope" })).rejects.toThrow(
      "Path escapes workspace root"
    );
  });
});
