import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileWorkspaceRegistry } from "../src/workspace/FileWorkspaceRegistry.ts";

describe("FileWorkspaceRegistry", () => {
  let dir: string;
  let registryFile: string;
  let defaultRoot: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "workspace-registry-"));
    registryFile = join(dir, "workspaces.json");
    defaultRoot = join(dir, "workspace-root");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function makeRegistry(idSeed = "id-") {
    let n = 0;
    return new FileWorkspaceRegistry({
      filePath: registryFile,
      defaultRootPath: defaultRoot,
      generateId: () => `${idSeed}${++n}`,
      now: () => "2026-05-17T00:00:00.000Z",
    });
  }

  it("seeds a default workspace on first read", async () => {
    const registry = makeRegistry();
    const def = await registry.getDefault();

    expect(def.name).toBe("default");
    expect(def.isDefault).toBe(true);
    expect(def.rootPath).toBe(defaultRoot);
    await expect(stat(defaultRoot)).resolves.toBeDefined();

    const persisted = JSON.parse(await readFile(registryFile, "utf8"));
    expect(persisted.version).toBe(1);
    expect(persisted.workspaces).toHaveLength(1);
    expect(persisted.workspaces[0].name).toBe("default");
  });

  it("registers an additional workspace and keeps a single default", async () => {
    const registry = makeRegistry();
    const customRoot = join(dir, "notes");
    const created = await registry.register({
      name: "Notes",
      description: "日常笔记",
      rootPath: customRoot,
    });

    expect(created.isDefault).toBe(false);
    await expect(stat(customRoot)).resolves.toBeDefined();

    const all = await registry.list();
    expect(all).toHaveLength(2);
    expect(all.filter((w) => w.isDefault)).toHaveLength(1);
  });

  it("rejects non-absolute rootPath", async () => {
    const registry = makeRegistry();
    await expect(
      registry.register({ name: "x", description: "", rootPath: "relative/path" })
    ).rejects.toThrow(/absolute/);
  });

  it("updates name and description but not rootPath", async () => {
    const registry = makeRegistry();
    const ws = await registry.register({
      name: "Old",
      description: "old",
      rootPath: join(dir, "ws"),
    });

    const updated = await registry.update(ws.id, {
      name: "New",
      description: "new desc",
    });

    expect(updated.name).toBe("New");
    expect(updated.description).toBe("new desc");
    expect(updated.rootPath).toBe(ws.rootPath);
  });

  it("refuses to remove the default workspace", async () => {
    const registry = makeRegistry();
    const def = await registry.getDefault();
    await expect(registry.remove(def.id)).rejects.toThrow(/default/);
  });

  it("removes non-default workspaces but leaves disk untouched", async () => {
    const registry = makeRegistry();
    const root = join(dir, "drafts");
    const ws = await registry.register({
      name: "Drafts",
      description: "",
      rootPath: root,
    });

    await registry.remove(ws.id);
    expect(await registry.get(ws.id)).toBeNull();
    await expect(stat(root)).resolves.toBeDefined();
  });

  it("summarize omits rootPath", async () => {
    const registry = makeRegistry();
    await registry.getDefault();
    const summary = await registry.summarize();
    expect(summary[0]).toEqual({
      id: expect.any(String),
      name: "default",
      description: expect.any(String),
      isDefault: true,
    });
    expect((summary[0] as { rootPath?: string }).rootPath).toBeUndefined();
  });

  it("survives a fresh registry instance", async () => {
    const registry = makeRegistry("first-");
    const def = await registry.getDefault();

    const reopened = makeRegistry("second-");
    const loaded = await reopened.getDefault();
    expect(loaded.id).toBe(def.id);
  });

  it("repairs missing default flag on load", async () => {
    const registry = makeRegistry();
    await registry.getDefault();

    const file = JSON.parse(await readFile(registryFile, "utf8"));
    file.workspaces[0].isDefault = false;
    await rm(registryFile);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(registryFile, JSON.stringify(file), "utf8");

    const reopened = makeRegistry();
    const def = await reopened.getDefault();
    expect(def.isDefault).toBe(true);
  });
});
