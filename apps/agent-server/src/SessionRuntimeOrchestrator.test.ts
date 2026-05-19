import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent } from "../../../packages/core/src/runtime/AgentRuntime.ts";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage.ts";
import { InMemorySessionStore } from "../../../packages/core/src/storage/index.ts";
import { SessionPersistence } from "./SessionPersistence.ts";
import { SessionRuntimeOrchestrator } from "./SessionRuntimeOrchestrator.ts";
import type { BlobRecord } from "../../../packages/core/src/blob/BlobRecord.ts";
import type { BlobStore } from "../../../packages/core/src/blob/BlobStore.ts";

function createUserMessage(
  sessionId: string,
  text: string,
  messageId: string,
): Extract<SessionMessage, { type: "user_message" }> {
  return {
    type: "user_message",
    sessionId,
    messageId,
    timestamp: "2026-05-11T10:00:00.000Z",
    payload: { text },
  };
}

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

describe("SessionRuntimeOrchestrator", () => {
  it("pushes assistant events and persists final user + assistant messages", async () => {
    const pushed: SessionMessage[] = [];
    const runtimeCalls: AgentMessage[][] = [];
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-11T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async runWithMessages(
          messages: AgentMessage[],
          onEvent: (event: AgentRuntimeEvent) => void,
        ) {
          runtimeCalls.push(messages.map((message) => ({ ...message })));
          onEvent({
            type: "assistant_message_start",
            messageId: "assistant-1",
            payload: { role: "assistant" },
          });
          onEvent({
            type: "assistant_message_delta",
            messageId: "assistant-1",
            payload: { text: "你好，我收到了。" },
          });
          onEvent({
            type: "assistant_message_end",
            messageId: "assistant-1",
            payload: { status: "completed" },
          });

          return {
            messages: [
              ...messages,
              {
                role: "assistant" as const,
                content: "你好，我收到了。",
              },
            ],
            bubbles: [],
          };
        },
      },
      persistence,
      () => "2026-05-11T00:00:00.000Z",
    );

    await orchestrator.handleUserMessage(
      createUserMessage("session-1", "第一句", "user-1"),
      (message) => pushed.push(message),
    );

    expect(runtimeCalls).toEqual([
      [
        {
          role: "user",
          content: "第一句",
        },
      ],
    ]);
    expect(pushed).toEqual([
      {
        type: "assistant_message_start",
        sessionId: "session-1",
        messageId: "session-1-assistant-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: { role: "assistant" },
      },
      {
        type: "assistant_message_delta",
        sessionId: "session-1",
        messageId: "session-1-assistant-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: { text: "你好，我收到了。" },
      },
      {
        type: "assistant_message_end",
        sessionId: "session-1",
        messageId: "session-1-assistant-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: { status: "completed" },
      },
    ]);
    expect(await persistence.getMessages("session-1")).toEqual([
      {
        role: "user",
        content: "第一句",
      },
      {
        role: "assistant",
        content: "你好，我收到了。",
      },
    ]);
  });

  it("passes current session history and run options into runtime on later turns", async () => {
    const runtimeCalls: AgentMessage[][] = [];
    const seenRunOptions: Array<Record<string, unknown> | undefined> = [];
    const replies = ["第一轮回复", "第二轮回复"];
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-11T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async runWithMessages(
          messages: AgentMessage[],
          _onEvent,
          runOptions?: Record<string, unknown>,
        ) {
          runtimeCalls.push(messages.map((message) => ({ ...message })));
          seenRunOptions.push(runOptions);
          const reply = replies[runtimeCalls.length - 1];
          return {
            messages: [
              ...messages,
              {
                role: "assistant" as const,
                content: reply,
              },
            ],
            bubbles: [],
          };
        },
      },
      persistence,
      () => "2026-05-11T00:00:00.000Z",
    );

    await orchestrator.handleUserMessage(
      createUserMessage("session-2", "第一句", "user-1"),
      () => {},
    );
    await orchestrator.handleUserMessage(
      createUserMessage("session-2", "第二句", "user-2"),
      () => {},
    );

    expect(runtimeCalls).toEqual([
      [
        {
          role: "user",
          content: "第一句",
        },
      ],
      [
        {
          role: "user",
          content: "第一句",
        },
        {
          role: "assistant",
          content: "第一轮回复",
        },
        {
          role: "user",
          content: "第二句",
        },
      ],
    ]);
    expect(seenRunOptions).toEqual([
      { sessionId: "session-2" },
      { sessionId: "session-2" },
    ]);
  });

  it("waits for pending summaries before passing history into runtime", async () => {
    const runtimeCalls: AgentMessage[][] = [];
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-11T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async waitForPendingSummaries(messages: AgentMessage[] = []) {
          messages.push({ role: "system", content: "summary ready" });
        },
        async runWithMessages(messages: AgentMessage[]) {
          runtimeCalls.push(messages.map((message) => ({ ...message })));
          return { messages, bubbles: [] };
        },
      },
      persistence,
      () => "2026-05-11T00:00:00.000Z",
    );

    await orchestrator.handleUserMessage(
      createUserMessage("session-summary", "第一句", "user-1"),
      () => {},
    );

    expect(runtimeCalls).toEqual([
      [
        { role: "user", content: "第一句" },
        { role: "system", content: "summary ready" },
      ],
    ]);
  });

  it("passes image attachments to runtime as multimodal content while persisting stubs", async () => {
    const runtimeCalls: AgentMessage[][] = [];
    const blobStore = new MemoryBlobStore();
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-11T00:00:00.000Z",
      blobStore,
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async runWithMessages(messages: AgentMessage[]) {
          runtimeCalls.push(messages.map((message) => ({ ...message })));
          return { messages, bubbles: [] };
        },
      },
      persistence,
      () => "2026-05-11T00:00:00.000Z",
    );

    await orchestrator.handleUserMessage(
      {
        ...createUserMessage("session-image", "描述图片", "user-1"),
        payload: {
          text: "描述图片",
          attachments: [
            {
              kind: "image",
              id: "img-1",
              mimeType: "image/png",
              base64: Buffer.from("png-bytes").toString("base64"),
            },
          ],
        },
      },
      () => {},
    );

    expect(runtimeCalls).toEqual([
      [
        {
          role: "user",
          content: [
            { type: "text", text: "描述图片" },
            { type: "image", blobId: "blob-1", mimeType: "image/png" },
          ],
        },
      ],
    ]);
    expect(await persistence.getMessages("session-image")).toEqual([
      {
        role: "user",
        content:
          '描述图片\n\n[STUB id=blob-1 kind=image size=9 path="/tmp/blob-1.png"]\n[/STUB]',
      },
    ]);
  });

  it("translates tool events into tool frames and records audit events", async () => {
    const pushed: SessionMessage[] = [];
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-17T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async runWithMessages(messages: AgentMessage[], onEvent) {
          onEvent({
            type: "tool_call",
            toolCallId: "tc-1",
            toolName: "file.read",
            input: { path: "/tmp/test.txt" },
          });
          onEvent({
            type: "tool_result",
            toolCallId: "tc-1",
            toolName: "file.read",
            status: "success",
            output: "file contents here",
            durationMs: 12,
          });
          return {
            messages: [
              ...messages,
              {
                role: "assistant" as const,
                content: "reading file",
                toolCalls: [
                  { id: "tc-1", name: "file.read", arguments: { path: "/tmp/test.txt" } },
                ],
              },
              {
                role: "tool" as const,
                toolCallId: "tc-1",
                name: "file.read",
                content: "file contents here",
              },
            ],
            bubbles: [],
          };
        },
      },
      persistence,
      () => "2026-05-17T00:00:00.000Z",
    );

    await orchestrator.handleUserMessage(
      createUserMessage("session-tool", "读取文件", "user-1"),
      (message) => pushed.push(message),
    );

    expect(pushed).toEqual([
      {
        type: "tool_message",
        sessionId: "session-tool",
        messageId: "session-tool-tc-1",
        timestamp: "2026-05-17T00:00:00.000Z",
        payload: { name: "file.read", text: "{\"path\":\"/tmp/test.txt\"}", status: "running" },
      },
      {
        type: "tool_message",
        sessionId: "session-tool",
        messageId: "session-tool-tc-1",
        timestamp: "2026-05-17T00:00:00.000Z",
        payload: { name: "file.read", text: "file contents here", status: "completed" },
      },
    ]);
    const session = await persistence.getSession("session-tool");
    expect(session?.events).toEqual([
      {
        type: "tool_call",
        timestamp: "2026-05-17T00:00:00.000Z",
        toolCallId: "tc-1",
        toolName: "file.read",
        input: { path: "/tmp/test.txt" },
      },
      {
        type: "tool_result",
        timestamp: "2026-05-17T00:00:00.000Z",
        toolCallId: "tc-1",
        status: "success",
        output: "file contents here",
        durationMs: 12,
      },
    ]);
  });

  it("pushes and records an error when runtime execution fails", async () => {
    const pushed: SessionMessage[] = [];
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-11T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async runWithMessages() {
          throw new Error("Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。");
        },
      },
      persistence,
      () => "2026-05-11T00:00:00.000Z",
    );

    await orchestrator.handleUserMessage(
      createUserMessage("session-4", "你好", "user-1"),
      (message) => pushed.push(message),
    );

    expect(pushed).toEqual([
      {
        type: "error",
        sessionId: "session-4",
        messageId: "session-4-error",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: {
          message: "Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。",
        },
      },
    ]);
    const session = await persistence.getSession("session-4");
    expect(session?.messages).toEqual([{ role: "user", content: "你好" }]);
    expect(session?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-11T00:00:00.000Z",
        message: "Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。",
      },
    ]);
  });
});
