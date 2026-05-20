import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSessionStore } from "../../src/storage/FileSessionStore.ts";

describe("FileSessionStore", () => {
  let dir: string;
  let store: FileSessionStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "session-store-"));
    store = new FileSessionStore(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates a session and persists it to disk", async () => {
    const session = await store.create({
      id: "s1",
      title: "测试会话",
      createdAt: "2026-05-17T00:00:00.000Z",
    });

    expect(session.version).toBe(1);
    expect(session.metadata.id).toBe("s1");
    expect(session.metadata.title).toBe("测试会话");
    expect(session.messages).toEqual([]);
    expect(session.events).toEqual([]);

    const loaded = await store.get("s1");
    expect(loaded).toEqual(session);
  });

  it("returns null for non-existent session", async () => {
    const result = await store.get("nonexistent");
    expect(result).toBeNull();
  });

  it("lists sessions sorted by updatedAt descending", async () => {
    await store.create({ id: "old", createdAt: "2026-05-01T00:00:00.000Z" });
    await store.create({ id: "new", createdAt: "2026-05-17T00:00:00.000Z" });

    const list = await store.list();
    expect(list[0].id).toBe("new");
    expect(list[1].id).toBe("old");
  });

  it("deletes a session", async () => {
    await store.create({ id: "to-delete" });
    await store.delete("to-delete");
    const result = await store.get("to-delete");
    expect(result).toBeNull();
  });

  it("delete is idempotent for missing sessions", async () => {
    await expect(store.delete("ghost")).resolves.toBeUndefined();
  });

  it("updates title", async () => {
    await store.create({ id: "s1", title: "原标题" });
    await store.updateTitle("s1", "新标题");
    const session = await store.get("s1");
    expect(session?.metadata.title).toBe("新标题");
  });

  it("appends messages and updates metadata", async () => {
    await store.create({ id: "s1", createdAt: "2026-05-17T00:00:00.000Z" });
    await store.appendMessages(
      "s1",
      [{ role: "user", content: "hello" }],
      "2026-05-17T01:00:00.000Z",
    );

    const session = await store.get("s1");
    expect(session?.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(session?.metadata.messageCount).toBe(1);
    expect(session?.metadata.updatedAt).toBe("2026-05-17T01:00:00.000Z");
  });

  it("sets messages (replaces all)", async () => {
    await store.create({ id: "s1" });
    await store.appendMessages("s1", [{ role: "user", content: "first" }], "t1");
    await store.setMessages(
      "s1",
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
      ],
      "t2",
    );

    const session = await store.get("s1");
    expect(session?.messages.length).toBe(2);
    expect(session?.metadata.messageCount).toBe(2);
  });

  it("appends events for audit trail", async () => {
    await store.create({ id: "s1" });
    await store.appendEvents("s1", [
      {
        type: "tool_call",
        timestamp: "2026-05-17T00:00:00.000Z",
        toolCallId: "tc-1",
        toolName: "file.read",
        input: { path: "/tmp/x" },
      },
    ]);
    await store.appendEvents("s1", [
      {
        type: "tool_result",
        timestamp: "2026-05-17T00:00:01.000Z",
        toolCallId: "tc-1",
        status: "success",
        output: "content",
      },
    ]);

    const session = await store.get("s1");
    expect(session?.events.length).toBe(2);
    expect(session?.events[0].type).toBe("tool_call");
    expect(session?.events[1].type).toBe("tool_result");
  });

  it("survives a fresh store instance (persistence)", async () => {
    await store.create({ id: "persist-test", title: "持久化" });
    await store.appendMessages(
      "persist-test",
      [{ role: "user", content: "hello" }],
      "2026-05-17T00:00:00.000Z",
    );

    const store2 = new FileSessionStore(dir);
    const session = await store2.get("persist-test");
    expect(session?.metadata.title).toBe("持久化");
    expect(session?.messages).toEqual([{ role: "user", content: "hello" }]);
  });
});
