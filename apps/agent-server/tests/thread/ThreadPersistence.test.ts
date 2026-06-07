import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import { InMemoryThreadStore } from "@handagent/core/storage/index.ts";
import { MemoryBlobStore } from "../support/MemoryBlobStore.ts";
import { ThreadPersistence } from "../../src/thread/ThreadPersistence.ts";

class InterleavingThreadStore extends InMemoryThreadStore {
  private interleavedMessage: AgentMessage | null = null;

  armInterleavedAppend(message: AgentMessage): void {
    this.interleavedMessage = message;
  }

  override async appendMessages(
    threadId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void> {
    await this.appendInterleavedIfArmed(threadId, updatedAt);
    await super.appendMessages(threadId, messages, updatedAt);
  }

  override async setMessages(
    threadId: string,
    messages: AgentMessage[],
    updatedAt: string,
  ): Promise<void> {
    await this.appendInterleavedIfArmed(threadId, updatedAt);
    await super.setMessages(threadId, messages, updatedAt);
  }

  private async appendInterleavedIfArmed(threadId: string, updatedAt: string): Promise<void> {
    if (!this.interleavedMessage) return;

    const message = this.interleavedMessage;
    this.interleavedMessage = null;
    await super.appendMessages(threadId, [message], updatedAt);
  }
}

describe("ThreadPersistence", () => {
  it("wraps Thread CRUD operations", async () => {
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-17T00:00:00.000Z",
    );

    const Thread = await persistence.createThread("测试 thread");
    expect(Thread.metadata.preview).toBe("测试 thread");

    await persistence.renameThread(Thread.metadata.id, "新预览");
    const updated = await persistence.getThread(Thread.metadata.id);
    expect(updated?.metadata.preview).toBe("新预览");

    const Threads = await persistence.listThreads();
    expect(Threads).toEqual([
      {
        id: Thread.metadata.id,
        preview: "新预览",
        createdAt: "2026-05-17T00:00:00.000Z",
        updatedAt: "2026-05-17T00:00:00.000Z",
        messageCount: 0,
        workspaceId: null,
        actionBinding: undefined,
      },
    ]);

    await persistence.deleteThread(Thread.metadata.id);
    expect(await persistence.getThread(Thread.metadata.id)).toBeNull();
  });

  it("persists user content with attachments and derives the first preview", async () => {
    const store = new InMemoryThreadStore();
    const persistence = new ThreadPersistence(
      store,
      () => "2026-05-17T00:00:00.000Z",
    );

    await persistence.ensureThread("Thread-attach");
    await persistence.persistUserMessage("Thread-attach", "解释这段代码", [
      { kind: "text_selection", id: "a", text: "let x = 1" },
    ]);
    await persistence.autoTitle("Thread-attach", "解释这段代码");

    expect(await persistence.getMessages("Thread-attach")).toEqual([
      {
        role: "user",
        content: "解释这段代码\n\n[选区]\nlet x = 1",
      },
    ]);
    const Thread = await persistence.getThread("Thread-attach");
    expect(Thread?.metadata.preview).toBe("解释这段代码");
  });

  it("leaves an existing preview unchanged on later messages", async () => {
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-17T00:00:00.000Z",
    );

    await persistence.ensureThread("Thread-title");
    await persistence.persistUserMessage("Thread-title", "第一句");
    await persistence.autoTitle("Thread-title", "第一句");
    await persistence.persistUserMessage("Thread-title", "第二句");
    await persistence.autoTitle("Thread-title", "第二句");

    const Thread = await persistence.getThread("Thread-title");
    expect(Thread?.metadata.preview).toBe("第一句");
    expect(Thread?.messages).toEqual([
      { role: "user", content: "第一句" },
      { role: "user", content: "第二句" },
    ]);
  });

  it("stores image attachments as blobs and inserts image stubs into user content", async () => {
    const blobStore = new MemoryBlobStore();
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-18T00:00:00.000Z",
      blobStore,
    );

    await persistence.ensureThread("Thread-image");
    await persistence.persistUserMessage("Thread-image", "看看这张图", [
      {
        kind: "image",
        id: "image-1",
        mimeType: "image/png",
        base64: Buffer.from("png-bytes").toString("base64"),
      },
    ]);

    expect(blobStore.records).toEqual([
      {
        id: "blob-1",
        kind: "image",
        size: 9,
        path: "/tmp/blob-1.png",
      },
    ]);
    await expect(blobStore.readContent("blob-1")).resolves.toEqual(Buffer.from("png-bytes"));
    expect(await persistence.getMessages("Thread-image")).toEqual([
      {
        role: "user",
        content:
          '看看这张图\n\n[STUB id=blob-1 kind=image size=9 path="/tmp/blob-1.png"]\n[/STUB]',
      },
    ]);
  });

  it("returns conversation messages without exposing store shape", async () => {
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-17T00:00:00.000Z",
    );
    const finalMessages: AgentMessage[] = [
      { role: "user", content: "读取文件" },
      { role: "assistant", content: "reading file" },
      {
        role: "tool",
        toolCallId: "tc-1",
        name: "file.read",
        content: "file contents",
      },
    ];

    await persistence.ensureThread("Thread-conversation");
    await persistence.persistRunResult("Thread-conversation", finalMessages, []);

    expect(await persistence.getConversationMessages("Thread-conversation")).toEqual([
      {
        id: "msg-0",
        role: "user",
        text: "读取文件",
        status: "completed",
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
      },
      {
        id: "msg-1",
        role: "assistant",
        text: "reading file",
        status: "completed",
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
      },
      {
        id: "msg-2",
        role: "tool",
        text: "file contents",
        status: "completed",
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
        toolCall: { name: "file.read" },
      },
    ]);
  });

  it("persists final runtime messages and audit events", async () => {
    const store = new InMemoryThreadStore();
    const persistence = new ThreadPersistence(
      store,
      () => "2026-05-17T00:00:00.000Z",
    );
    const messages: AgentMessage[] = [
      { role: "user", content: "读取文件" },
      { role: "assistant", content: "reading file" },
    ];

    await persistence.ensureThread("Thread-audit");
    await persistence.persistRunResult("Thread-audit", messages, [
      {
        type: "tool_call",
        timestamp: "2026-05-17T00:00:00.000Z",
        toolCallId: "tc-1",
        toolName: "file.read",
        input: { path: "/tmp/test.txt" },
      },
    ]);

    const Thread = await persistence.getThread("Thread-audit");
    expect(Thread?.messages).toEqual(messages);
    expect(Thread?.events).toEqual([
      {
        type: "tool_call",
        timestamp: "2026-05-17T00:00:00.000Z",
        toolCallId: "tc-1",
        toolName: "file.read",
        input: { path: "/tmp/test.txt" },
      },
    ]);
  });

  it("appends runtime output without dropping user input recorded during the run", async () => {
    const store = new InterleavingThreadStore();
    const persistence = new ThreadPersistence(
      store,
      () => "2026-06-07T00:00:00.000Z",
    );
    await persistence.ensureThread("thread-delta");
    await persistence.persistUserMessage("thread-delta", "first");
    const baseMessagesSnapshot = [
      ...await persistence.getMessages("thread-delta"),
    ];
    const baseMessageCount = baseMessagesSnapshot.length;

    await persistence.persistUserMessage("thread-delta", "steered while running");
    store.armInterleavedAppend({ role: "user", content: "queued before runtime append" });
    await persistence.persistRunDelta(
      "thread-delta",
      baseMessageCount,
      [
        ...baseMessagesSnapshot,
        { role: "assistant", content: "reply to first" },
      ],
      [
        {
          type: "tool_call",
          timestamp: "2026-06-07T00:00:01.000Z",
          toolCallId: "tc-delta",
          toolName: "file.read",
          input: { path: "/tmp/delta.txt" },
        },
      ],
    );

    const thread = await persistence.getThread("thread-delta");
    expect(thread?.messages).toEqual([
      { role: "user", content: "first" },
      { role: "user", content: "steered while running" },
      { role: "user", content: "queued before runtime append" },
      { role: "assistant", content: "reply to first" },
    ]);
    expect(thread?.events).toEqual([
      {
        type: "tool_call",
        timestamp: "2026-06-07T00:00:01.000Z",
        toolCallId: "tc-delta",
        toolName: "file.read",
        input: { path: "/tmp/delta.txt" },
      },
    ]);
  });

  it("persists runtime errors as audit events", async () => {
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-17T00:00:00.000Z",
    );

    await persistence.ensureThread("Thread-error");
    await persistence.persistError("Thread-error", "Missing apiKey");

    const Thread = await persistence.getThread("Thread-error");
    expect(Thread?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-17T00:00:00.000Z",
        message: "Missing apiKey",
      },
    ]);
    expect("code" in Thread!.events[0]).toBe(false);
  });
});
