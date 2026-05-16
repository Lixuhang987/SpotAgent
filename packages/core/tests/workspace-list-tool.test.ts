import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileWorkspaceRegistry } from "../src/workspace/FileWorkspaceRegistry.ts";
import { WorkspaceListTool } from "../src/tools/builtins/WorkspaceListTool.ts";

async function makeRegistry() {
  const dir = await mkdtemp(join(tmpdir(), "workspace-list-tool-"));
  return new FileWorkspaceRegistry({
    filePath: join(dir, "workspaces.json"),
    defaultRootPath: join(dir, "ws"),
  });
}

describe("WorkspaceListTool", () => {
  it("returns summaries that exclude rootPath", async () => {
    const registry = await makeRegistry();
    await registry.getDefault();
    await registry.register({
      name: "Notes",
      description: "日常笔记",
      rootPath: join(await mkdtemp(join(tmpdir(), "notes-")), "x"),
    });

    const tool = new WorkspaceListTool(registry);
    const result = await tool.call({});

    expect(result.workspaces).toHaveLength(2);
    for (const ws of result.workspaces) {
      expect(ws).toHaveProperty("id");
      expect(ws).toHaveProperty("name");
      expect(ws).toHaveProperty("description");
      expect(ws).toHaveProperty("isDefault");
      expect((ws as { rootPath?: string }).rootPath).toBeUndefined();
    }
  });
});
