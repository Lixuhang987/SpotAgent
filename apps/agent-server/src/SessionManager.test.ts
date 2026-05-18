import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent } from "../../../packages/core/src/runtime/AgentRuntime.ts";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage.ts";
import type { BlobRecord } from "../../../packages/core/src/blob/BlobRecord.ts";
import type { BlobStore } from "../../../packages/core/src/blob/BlobStore.ts";
import { SessionManager } from "./SessionManager.ts";
import { InMemorySessionStore } from "../../../packages/core/src/storage/index.ts";
import { handleSocketMessage } from "./server.ts";

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

describe("SessionManager", () => {
  it("lists sessions and returns history through the store abstraction", async () => {
    const store = new InMemorySessionStore();
    await store.create({
      id: "session-1",
      createdAt: "2026-05-14T00:00:00.000Z",
    });
    await store.appendMessages(
      "session-1",
      [{ role: "user", content: "hello" }],
      "2026-05-14T00:00:00.000Z",
    );

    const sessions = await store.list();
    expect(sessions).toEqual([
      {
        id: "session-1",
        title: null,
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        messageCount: 1,
      },
    ]);
    const session = await store.get("session-1");
    expect(session?.messages).toEqual([{ role: "user", content: "hello" }]);
  });

  it("exposes stored session history through SessionManager", async () => {
    const store = new InMemorySessionStore();
    const manager = new SessionManager(
      {
        async runWithMessages(messages: AgentMessage[]) {
          return {
            messages,
            bubbles: [],
          };
        },
      },
      () => {},
      {
        now: () => "2026-05-14T00:00:00.000Z",
        store,
      },
    );

    await manager.receive(createUserMessage("session-store", "hello", "user-1"));

    const sessions = await manager.listSessions();
    expect(sessions[0].id).toBe("session-store");
    expect(sessions[0].updatedAt).toBe("2026-05-14T00:00:00.000Z");

    const history = await manager.getSessionHistory("session-store");
    expect(history).toEqual([
      {
        role: "user",
        content: "hello",
      },
    ]);
  });

  it("pushes assistant delta events and persists final user + assistant messages", async () => {
    const pushed: SessionMessage[] = [];
    const runtimeCalls: AgentMessage[][] = [];
    const runtime = {
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
    };

    const manager = new SessionManager(
      runtime,
      (message) => {
        pushed.push(message);
      },
      {
        now: () => "2026-05-11T00:00:00.000Z",
      },
    );

    await manager.receive(createUserMessage("session-1", "第一句", "user-1"));

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
    const history = await manager.getSessionHistory("session-1");
    expect(history).toEqual([
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

  it("passes the current session history back into runtime on later turns", async () => {
    const runtimeCalls: AgentMessage[][] = [];
    const replies = ["第一轮回复", "第二轮回复"];
    const runtime = {
      async runWithMessages(
        messages: AgentMessage[],
        onEvent: (event: AgentRuntimeEvent) => void,
      ) {
        runtimeCalls.push(messages.map((message) => ({ ...message })));
        const reply = replies[runtimeCalls.length - 1];
        onEvent({
          type: "assistant_message_start",
          messageId: "assistant-1",
          payload: { role: "assistant" },
        });
        onEvent({
          type: "assistant_message_delta",
          messageId: "assistant-1",
          payload: { text: reply },
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
              content: reply,
            },
          ],
          bubbles: [],
        };
      },
    };

    const manager = new SessionManager(runtime, () => {}, {
      now: () => "2026-05-11T00:00:00.000Z",
    });

    await manager.receive(createUserMessage("session-2", "第一句", "user-1"));
    await manager.receive(createUserMessage("session-2", "第二句", "user-2"));

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
  });

  it("forwards websocket messages through SessionManager and sends outgoing JSON", async () => {
    const sent: string[] = [];
    const manager = new SessionManager(
      {
        async runWithMessages(
          messages: AgentMessage[],
          onEvent: (event: AgentRuntimeEvent) => void,
        ) {
          void messages;
          onEvent({
            type: "assistant_message_start",
            messageId: "assistant-1",
            payload: { role: "assistant" },
          });
          onEvent({
            type: "assistant_message_delta",
            messageId: "assistant-1",
            payload: { text: "ws reply" },
          });
          onEvent({
            type: "assistant_message_end",
            messageId: "assistant-1",
            payload: { status: "completed" },
          });
          return {
            messages: [
              {
                role: "user" as const,
                content: "hello",
              },
              {
                role: "assistant" as const,
                content: "ws reply",
              },
            ],
            bubbles: [],
          };
        },
      },
      () => {},
      {
        now: () => "2026-05-11T00:00:00.000Z",
      },
    );

    await handleSocketMessage(
      manager,
      {
        send(value: string) {
          sent.push(value);
        },
      },
      JSON.stringify(createUserMessage("session-3", "hello", "user-1")),
    );

    expect(sent).toEqual([
      JSON.stringify({
        type: "assistant_message_start",
        sessionId: "session-3",
        messageId: "session-3-assistant-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: { role: "assistant" },
      }),
      JSON.stringify({
        type: "assistant_message_delta",
        sessionId: "session-3",
        messageId: "session-3-assistant-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: { text: "ws reply" },
      }),
      JSON.stringify({
        type: "assistant_message_end",
        sessionId: "session-3",
        messageId: "session-3-assistant-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: { status: "completed" },
      }),
    ]);
  });

  it("pushes an error message when runtime execution fails", async () => {
    const pushed: SessionMessage[] = [];
    const manager = new SessionManager(
      {
        async runWithMessages() {
          throw new Error("Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。");
        },
      },
      (message) => {
        pushed.push(message);
      },
      {
        now: () => "2026-05-11T00:00:00.000Z",
      },
    );

    await manager.receive(createUserMessage("session-4", "你好", "user-1"));

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
    const history = await manager.getSessionHistory("session-4");
    expect(history).toEqual([
      {
        role: "user",
        content: "你好",
      },
    ]);
  });

  it("auto-generates title from first user message", async () => {
    const store = new InMemorySessionStore();
    const manager = new SessionManager(
      {
        async runWithMessages(messages: AgentMessage[]) {
          return { messages, bubbles: [] };
        },
      },
      () => {},
      { now: () => "2026-05-17T00:00:00.000Z", store },
    );

    await manager.receive(createUserMessage("session-title", "帮我写一个 React 组件", "user-1"));

    const session = await manager.getSession("session-title");
    expect(session?.metadata.title).toBe("帮我写一个 React 组件");
  });

  it("supports session CRUD operations", async () => {
    const store = new InMemorySessionStore();
    const manager = new SessionManager(
      {
        async runWithMessages(messages: AgentMessage[]) {
          return { messages, bubbles: [] };
        },
      },
      () => {},
      { now: () => "2026-05-17T00:00:00.000Z", store },
    );

    const session = await manager.createSession("测试会话");
    expect(session.metadata.title).toBe("测试会话");

    await manager.renameSession(session.metadata.id, "新标题");
    const updated = await manager.getSession(session.metadata.id);
    expect(updated?.metadata.title).toBe("新标题");

    const sessions = await manager.listSessions();
    expect(sessions.length).toBe(1);

    await manager.deleteSession(session.metadata.id);
    const deleted = await manager.getSession(session.metadata.id);
    expect(deleted).toBeNull();
  });

  it("composes user content with text_selection attachments", async () => {
    const store = new InMemorySessionStore();
    const manager = new SessionManager(
      {
        async runWithMessages(messages: AgentMessage[]) {
          return { messages, bubbles: [] };
        },
      },
      () => {},
      { now: () => "2026-05-17T00:00:00.000Z", store },
    );

    const message: Extract<SessionMessage, { type: "user_message" }> = {
      type: "user_message",
      sessionId: "session-attach",
      messageId: "user-1",
      timestamp: "2026-05-17T00:00:00.000Z",
      payload: {
        text: "解释这段代码",
        attachments: [
          { kind: "text_selection", id: "a", text: "let x = 1" },
        ],
      },
    };
    await manager.receive(message);

    const session = await manager.getSession("session-attach");
    expect(session?.messages[0]).toEqual({
      role: "user",
      content: "解释这段代码\n\n[选区]\nlet x = 1",
    });
  });

  it("stores image attachments as blobs and inserts image stubs into user content", async () => {
    const store = new InMemorySessionStore();
    const blobStore = new MemoryBlobStore();
    const manager = new SessionManager(
      {
        async runWithMessages(messages: AgentMessage[]) {
          return { messages, bubbles: [] };
        },
      },
      () => {},
      {
        now: () => "2026-05-18T00:00:00.000Z",
        store,
        blobStore,
      },
    );

    await manager.receive({
      type: "user_message",
      sessionId: "session-image",
      messageId: "user-1",
      timestamp: "2026-05-18T00:00:00.000Z",
      payload: {
        text: "看看这张图",
        attachments: [
          {
            kind: "image",
            id: "image-1",
            mimeType: "image/png",
            base64: Buffer.from("png-bytes").toString("base64"),
          },
        ],
      },
    });

    expect(blobStore.records).toEqual([
      {
        id: "blob-1",
        kind: "image",
        size: 9,
        path: "/tmp/blob-1.png",
      },
    ]);
    await expect(blobStore.readContent("blob-1")).resolves.toEqual(
      Buffer.from("png-bytes"),
    );
    const session = await manager.getSession("session-image");
    expect(session?.messages[0]).toEqual({
      role: "user",
      content:
        '看看这张图\n\n[STUB id=blob-1 kind=image size=9 path="/tmp/blob-1.png"]\n[/STUB]',
    });
  });

  it("forwards sessionId to runtime so permission bridge can route ask requests", async () => {
    const seenRunOptions: Array<Record<string, unknown> | undefined> = [];
    const manager = new SessionManager(
      {
        async runWithMessages(
          messages: AgentMessage[],
          _onEvent,
          runOptions?: Record<string, unknown>,
        ) {
          seenRunOptions.push(runOptions);
          return { messages, bubbles: [] };
        },
      },
      () => {},
      { now: () => "2026-05-17T00:00:00.000Z" },
    );

    await manager.receive(createUserMessage("session-perm", "请求一个 tool", "user-1"));

    expect(seenRunOptions).toEqual([{ sessionId: "session-perm" }]);
  });

  it("translates tool_call/tool_result events into tool_message frames", async () => {
    const pushed: SessionMessage[] = [];
    const manager = new SessionManager(
      {
        async runWithMessages(messages: AgentMessage[], onEvent) {
          onEvent({
            type: "tool_call",
            toolCallId: "tc-1",
            toolName: "clipboard.read",
            input: {},
          });
          onEvent({
            type: "tool_result",
            toolCallId: "tc-1",
            toolName: "clipboard.read",
            status: "success",
            output: "hello",
            durationMs: 5,
          });
          return { messages, bubbles: [] };
        },
      },
      (m) => pushed.push(m),
      { now: () => "2026-05-18T00:00:00.000Z" },
    );

    await manager.receive(createUserMessage("session-tool", "read clipboard", "user-1"));

    const toolFrames = pushed.filter((m) => m.type === "tool_message") as Extract<
      SessionMessage,
      { type: "tool_message" }
    >[];
    expect(toolFrames).toHaveLength(2);
    expect(toolFrames[0]).toEqual({
      type: "tool_message",
      sessionId: "session-tool",
      messageId: "session-tool-tc-1",
      timestamp: "2026-05-18T00:00:00.000Z",
      payload: { name: "clipboard.read", text: "{}", status: "running" },
    });
    expect(toolFrames[1]).toEqual({
      type: "tool_message",
      sessionId: "session-tool",
      messageId: "session-tool-tc-1",
      timestamp: "2026-05-18T00:00:00.000Z",
      payload: { name: "clipboard.read", text: "hello", status: "completed" },
    });
  });

  it("records tool call events for audit", async () => {
    const store = new InMemorySessionStore();
    const manager = new SessionManager(
      {
        async runWithMessages(messages: AgentMessage[], onEvent) {
          onEvent({
            type: "assistant_message_start",
            messageId: "assistant-1",
            payload: { role: "assistant" },
          });
          onEvent({
            type: "assistant_message_delta",
            messageId: "assistant-1",
            payload: { text: "reading file" },
          });
          onEvent({
            type: "assistant_message_end",
            messageId: "assistant-1",
            payload: { status: "completed" },
          });
          onEvent({
            type: "tool_call",
            toolCallId: "tc-1",
            toolName: "file.read",
            input: { path: "/tmp/test.txt" },
          });
          onEvent({
            type: "tool_result",
            toolCallId: "tc-1",
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
      () => {},
      { now: () => "2026-05-17T00:00:00.000Z", store },
    );

    await manager.receive(createUserMessage("session-audit", "读取文件", "user-1"));

    const session = await manager.getSession("session-audit");
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
});
