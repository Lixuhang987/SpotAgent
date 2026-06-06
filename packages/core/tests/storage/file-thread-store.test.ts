import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileThreadStore } from "../../src/storage/FileThreadStore.ts";

describe("FileThreadStore", () => {
  let dir: string;
  let store: FileThreadStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "thread-store-"));
    store = new FileThreadStore(dir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("creates a thread and persists it to disk", async () => {
    const thread = await store.create({
      id: "thread-1",
      preview: "测试线程",
      createdAt: "2026-06-05T00:00:00.000Z",
    });

    expect(thread.version).toBe(1);
    expect(thread.metadata.id).toBe("thread-1");
    expect(thread.metadata.preview).toBe("测试线程");
    expect(thread.messages).toEqual([]);
    expect(thread.events).toEqual([]);

    const loaded = await store.get("thread-1");
    expect(loaded).toEqual(thread);
  });

  it("persists action binding metadata", async () => {
    const thread = await store.create({
      id: "thread-action",
      preview: "Action",
      createdAt: "2026-06-05T00:00:00.000Z",
      actionBinding: {
        pluginId: "review",
        promptName: "code_review",
        mcpServerIds: ["github"],
      },
    });

    expect(thread.metadata.actionBinding).toEqual({
      pluginId: "review",
      promptName: "code_review",
      mcpServerIds: ["github"],
    });

    const loaded = await store.get("thread-action");
    expect(loaded?.metadata.actionBinding?.mcpServerIds).toEqual(["github"]);
  });

  it("returns null for non-existent thread", async () => {
    const result = await store.get("nonexistent");
    expect(result).toBeNull();
  });

  it("lists threads sorted by updatedAt descending", async () => {
    await store.create({ id: "old", createdAt: "2026-06-05T00:00:00.000Z" });
    await store.create({ id: "new", createdAt: "2026-06-05T01:00:00.000Z" });

    const list = await store.list();
    expect(list[0].id).toBe("new");
    expect(list[1].id).toBe("old");
  });

  it("deletes a thread", async () => {
    await store.create({ id: "to-delete" });
    await store.delete("to-delete");
    const result = await store.get("to-delete");
    expect(result).toBeNull();
  });

  it("delete is idempotent for missing threads", async () => {
    await expect(store.delete("ghost")).resolves.toBeUndefined();
  });

  it("updates preview", async () => {
    await store.create({ id: "thread-1", preview: "原标题" });
    await store.updatePreview(
      "thread-1",
      "新标题",
      "2026-06-05T00:01:00.000Z",
    );
    const thread = await store.get("thread-1");
    expect(thread?.metadata.preview).toBe("新标题");
    expect(thread?.metadata.updatedAt).toBe("2026-06-05T00:01:00.000Z");
  });

  it("appends messages and updates metadata", async () => {
    await store.create({ id: "thread-1", createdAt: "2026-06-05T00:00:00.000Z" });
    await store.appendMessages(
      "thread-1",
      [{ role: "user", content: "hello" }],
      "2026-06-05T01:00:00.000Z",
    );

    const thread = await store.get("thread-1");
    expect(thread?.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(thread?.metadata.messageCount).toBe(1);
    expect(thread?.metadata.updatedAt).toBe("2026-06-05T01:00:00.000Z");
  });

  it("preserves concurrent appends to the same thread", async () => {
    await store.create({
      id: "thread-concurrent",
      createdAt: "2026-06-05T00:00:00.000Z",
    });
    const originalGet = store.get.bind(store);
    vi.spyOn(store, "get").mockImplementation(async (threadId) => {
      const snapshot = await originalGet(threadId);
      await delay(20);
      return snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
    });

    await Promise.all([
      store.appendMessages(
        "thread-concurrent",
        [{ role: "user", content: "first" }],
        "2026-06-05T00:01:00.000Z",
      ),
      store.appendMessages(
        "thread-concurrent",
        [{ role: "assistant", content: "second" }],
        "2026-06-05T00:02:00.000Z",
      ),
    ]);

    vi.restoreAllMocks();
    const thread = await store.get("thread-concurrent");
    expect(thread?.messages).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
    ]);
    expect(thread?.metadata.messageCount).toBe(2);
    expect(thread?.metadata.updatedAt).toBe("2026-06-05T00:02:00.000Z");
  });

  it("sets messages", async () => {
    await store.create({ id: "thread-1" });
    await store.appendMessages("thread-1", [{ role: "user", content: "first" }], "t1");
    await store.setMessages(
      "thread-1",
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
      ],
      "t2",
    );

    const thread = await store.get("thread-1");
    expect(thread?.messages.length).toBe(2);
    expect(thread?.metadata.messageCount).toBe(2);
  });

  it("appends events for audit trail", async () => {
    await store.create({ id: "thread-1" });
    await store.appendEvents("thread-1", [
      {
        type: "tool_call",
        timestamp: "2026-06-05T00:00:00.000Z",
        toolCallId: "tool-1",
        toolName: "file.read",
        input: { path: "/tmp/x" },
      },
    ]);
    await store.appendEvents("thread-1", [
      {
        type: "tool_result",
        timestamp: "2026-06-05T00:00:01.000Z",
        toolCallId: "tool-1",
        status: "success",
        output: "content",
      },
    ]);

    const thread = await store.get("thread-1");
    expect(thread?.events.length).toBe(2);
    expect(thread?.events[0].type).toBe("tool_call");
    expect(thread?.events[1].type).toBe("tool_result");
  });

  it("preserves concurrent event appends to the same thread", async () => {
    await store.create({ id: "thread-concurrent-events" });
    const originalGet = store.get.bind(store);
    vi.spyOn(store, "get").mockImplementation(async (threadId) => {
      const snapshot = await originalGet(threadId);
      await delay(20);
      return snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
    });

    await Promise.all([
      store.appendEvents("thread-concurrent-events", [
        {
          type: "tool_call",
          timestamp: "2026-06-05T00:00:00.000Z",
          toolCallId: "tool-1",
          toolName: "file.read",
          input: { path: "/tmp/a" },
        },
      ]),
      store.appendEvents("thread-concurrent-events", [
        {
          type: "tool_result",
          timestamp: "2026-06-05T00:00:01.000Z",
          toolCallId: "tool-1",
          status: "success",
          output: "ok",
        },
      ]),
    ]);

    vi.restoreAllMocks();
    const thread = await store.get("thread-concurrent-events");
    expect(thread?.events).toEqual([
      {
        type: "tool_call",
        timestamp: "2026-06-05T00:00:00.000Z",
        toolCallId: "tool-1",
        toolName: "file.read",
        input: { path: "/tmp/a" },
      },
      {
        type: "tool_result",
        timestamp: "2026-06-05T00:00:01.000Z",
        toolCallId: "tool-1",
        status: "success",
        output: "ok",
      },
    ]);
  });

  it("does not block writes for different threads", async () => {
    await store.create({ id: "slow-thread" });
    await store.create({ id: "fast-thread" });
    const originalGet = store.get.bind(store);
    const releaseSlowRead = Promise.withResolvers<void>();
    vi.spyOn(store, "get").mockImplementation(async (threadId) => {
      const snapshot = await originalGet(threadId);
      if (threadId === "slow-thread") {
        await releaseSlowRead.promise;
      }
      return snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
    });

    const slowAppend = store.appendMessages(
      "slow-thread",
      [{ role: "user", content: "slow" }],
      "2026-06-05T00:00:00.000Z",
    );
    const fastAppend = store.appendMessages(
      "fast-thread",
      [{ role: "user", content: "fast" }],
      "2026-06-05T00:00:01.000Z",
    );

    await expect(Promise.race([
      fastAppend.then(() => "fast-finished"),
      delay(50).then(() => "blocked"),
    ])).resolves.toBe("fast-finished");

    releaseSlowRead.resolve();
    await slowAppend;
    vi.restoreAllMocks();

    expect((await store.get("slow-thread"))?.messages).toEqual([
      { role: "user", content: "slow" },
    ]);
    expect((await store.get("fast-thread"))?.messages).toEqual([
      { role: "user", content: "fast" },
    ]);
  });

  it("survives a fresh store instance", async () => {
    await store.create({ id: "persist-test", preview: "持久化" });
    await store.appendMessages(
      "persist-test",
      [{ role: "user", content: "hello" }],
      "2026-06-05T00:00:00.000Z",
    );

    const store2 = new FileThreadStore(dir);
    const thread = await store2.get("persist-test");
    expect(thread?.metadata.preview).toBe("持久化");
    expect(thread?.messages).toEqual([{ role: "user", content: "hello" }]);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
