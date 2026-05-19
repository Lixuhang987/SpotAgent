import { describe, expect, it } from "vitest";
import type { BlobRecord } from "@handagent/core/blob/BlobRecord.ts";
import type { BlobStore } from "@handagent/core/blob/BlobStore.ts";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import { InMemorySessionStore } from "@handagent/core/storage/index.ts";
import { SessionPersistence } from "./SessionPersistence.ts";

class MemoryBlobStore implements BlobStore {
  records: BlobRecord[] = [];
  contents = new Map<string, Buffer>();

  async put(input: { kind: string; bytes: Buffer; extension: string }): Promise<BlobRecord> {
    const id = `blob-${this.records.length + 1}`;
    const record: BlobRecord = {
      id,
      kind: input.kind,
      size: input.bytes.byteLength,
      path: `/tmp/${id}.${input.extension}`,
    };
    this.records.push(record);
    this.contents.set(id, input.bytes);
    return record;
  }

  async get(id: string): Promise<BlobRecord | undefined> {
    return this.records.find((record) => record.id === id);
  }

  async readContent(id: string): Promise<Buffer> {
    const content = this.contents.get(id);
    if (!content) throw new Error(`Blob not found: ${id}`);
    return content;
  }

  async setSummary(id: string, summary: string): Promise<void> {
    const record = await this.get(id);
    if (record) record.summary = summary;
  }
}

describe("SessionPersistence", () => {
  it("wraps session CRUD operations", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-17T00:00:00.000Z",
    );

    const session = await persistence.createSession("测试会话");
    expect(session.metadata.title).toBe("测试会话");

    await persistence.renameSession(session.metadata.id, "新标题");
    const updated = await persistence.getSession(session.metadata.id);
    expect(updated?.metadata.title).toBe("新标题");

    const sessions = await persistence.listSessions();
    expect(sessions).toEqual([
      {
        id: session.metadata.id,
        title: "新标题",
        createdAt: "2026-05-17T00:00:00.000Z",
        updatedAt: "2026-05-17T00:00:00.000Z",
        messageCount: 0,
      },
    ]);

    await persistence.deleteSession(session.metadata.id);
    expect(await persistence.getSession(session.metadata.id)).toBeNull();
  });

  it("persists user content with attachments and derives the first title", async () => {
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-17T00:00:00.000Z",
    );

    await persistence.ensureSession("session-attach");
    await persistence.persistUserMessage("session-attach", "解释这段代码", [
      { kind: "text_selection", id: "a", text: "let x = 1" },
    ]);
    await persistence.autoTitle("session-attach", "解释这段代码");

    expect(await persistence.getMessages("session-attach")).toEqual([
      {
        role: "user",
        content: "解释这段代码\n\n[选区]\nlet x = 1",
      },
    ]);
    const session = await persistence.getSession("session-attach");
    expect(session?.metadata.title).toBe("解释这段代码");
  });

  it("leaves an existing title unchanged on later messages", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-17T00:00:00.000Z",
    );

    await persistence.ensureSession("session-title");
    await persistence.persistUserMessage("session-title", "第一句");
    await persistence.autoTitle("session-title", "第一句");
    await persistence.persistUserMessage("session-title", "第二句");
    await persistence.autoTitle("session-title", "第二句");

    const session = await persistence.getSession("session-title");
    expect(session?.metadata.title).toBe("第一句");
    expect(session?.messages).toEqual([
      { role: "user", content: "第一句" },
      { role: "user", content: "第二句" },
    ]);
  });

  it("stores image attachments as blobs and inserts image stubs into user content", async () => {
    const blobStore = new MemoryBlobStore();
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-18T00:00:00.000Z",
      blobStore,
    );

    await persistence.ensureSession("session-image");
    await persistence.persistUserMessage("session-image", "看看这张图", [
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
    expect(await persistence.getMessages("session-image")).toEqual([
      {
        role: "user",
        content:
          '看看这张图\n\n[STUB id=blob-1 kind=image size=9 path="/tmp/blob-1.png"]\n[/STUB]',
      },
    ]);
  });

  it("returns conversation messages without exposing store shape", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
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

    await persistence.ensureSession("session-conversation");
    await persistence.persistRunResult("session-conversation", finalMessages, []);

    expect(await persistence.getConversationMessages("session-conversation")).toEqual([
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
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-17T00:00:00.000Z",
    );
    const messages: AgentMessage[] = [
      { role: "user", content: "读取文件" },
      { role: "assistant", content: "reading file" },
    ];

    await persistence.ensureSession("session-audit");
    await persistence.persistRunResult("session-audit", messages, [
      {
        type: "tool_call",
        timestamp: "2026-05-17T00:00:00.000Z",
        toolCallId: "tc-1",
        toolName: "file.read",
        input: { path: "/tmp/test.txt" },
      },
    ]);

    const session = await persistence.getSession("session-audit");
    expect(session?.messages).toEqual(messages);
    expect(session?.events).toEqual([
      {
        type: "tool_call",
        timestamp: "2026-05-17T00:00:00.000Z",
        toolCallId: "tc-1",
        toolName: "file.read",
        input: { path: "/tmp/test.txt" },
      },
    ]);
  });

  it("persists runtime errors as audit events", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-17T00:00:00.000Z",
    );

    await persistence.ensureSession("session-error");
    await persistence.persistError("session-error", "Missing apiKey");

    const session = await persistence.getSession("session-error");
    expect(session?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-17T00:00:00.000Z",
        message: "Missing apiKey",
      },
    ]);
  });
});
