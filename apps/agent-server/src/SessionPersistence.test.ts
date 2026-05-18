import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import { InMemorySessionStore } from "../../../packages/core/src/storage/index.ts";
import { SessionPersistence } from "./SessionPersistence.ts";

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
