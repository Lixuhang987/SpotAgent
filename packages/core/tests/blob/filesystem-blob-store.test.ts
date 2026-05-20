import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FilesystemBlobStore } from "../../src/blob/FilesystemBlobStore";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("FilesystemBlobStore", () => {
  it("stores bytes and metadata under a dated blob directory", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "handagent-blobs-"));
    tempRoots.push(rootPath);
    const store = new FilesystemBlobStore({
      rootPath,
      now: () => new Date("2026-05-18T12:34:56.000Z"),
      idFactory: () => "fixed-id",
    });

    const record = await store.put({
      kind: "tool_result",
      bytes: Buffer.from("hello blob", "utf8"),
      extension: "txt",
    });

    expect(record).toEqual({
      id: "blob-fixed-id",
      kind: "tool_result",
      size: 10,
      path: join(rootPath, "2026-05-18", "fixed-id.txt"),
    });
    await expect(readFile(record.path, "utf8")).resolves.toBe("hello blob");
    await expect(readFile(join(rootPath, "2026-05-18", "fixed-id.meta.json"), "utf8"))
      .resolves.toContain('"id": "blob-fixed-id"');
    await expect(store.get("blob-fixed-id")).resolves.toEqual(record);
    await expect(store.readContent("blob-fixed-id")).resolves.toEqual(
      Buffer.from("hello blob", "utf8"),
    );
  });

  it("updates summary in the sidecar metadata", async () => {
    const rootPath = await mkdtemp(join(tmpdir(), "handagent-blobs-"));
    tempRoots.push(rootPath);
    const store = new FilesystemBlobStore({
      rootPath,
      now: () => new Date("2026-05-18T12:34:56.000Z"),
      idFactory: () => "summary-id",
    });
    await store.put({
      kind: "tool_result",
      bytes: Buffer.from("line 1\nline 2", "utf8"),
      extension: "txt",
    });

    await store.setSummary("blob-summary-id", "保留了 line 2 的关键信息。");

    await expect(store.get("blob-summary-id")).resolves.toEqual({
      id: "blob-summary-id",
      kind: "tool_result",
      size: 13,
      path: join(rootPath, "2026-05-18", "summary-id.txt"),
      summary: "保留了 line 2 的关键信息。",
    });
  });
});
