import { describe, expect, it } from "vitest";
import { AgentRuntime } from "../../src/runtime/AgentRuntime";
import { ToolRegistry } from "../../src/tools/ToolRegistry";
import type { AgentTool } from "../../src/tools/AgentTool";
import type { AgentMessage } from "../../src/runtime/AgentMessage";
import type { LLMClient, LLMStreamEvent } from "../../src/llm/LLMClient";
import type { BlobRecord } from "../../src/blob/BlobRecord";
import type { BlobStore } from "../../src/blob/BlobStore";
import type { TurnSummarizerLike } from "../../src/runtime/TurnSummarizer";
import { MetaToolUseTool, META_TOOL_NAME, META_TOOL_ALREADY_ACTIVE_RESULT } from "../../src/tools/MetaToolUseTool";
import type { PermissionPolicy, PermissionRequest, PermissionResolution } from "../../src/permission/PermissionPolicy";

class FakeTool implements AgentTool {
  name = "echo";
  description = "echo tool";
  inputSchema = {
    type: "object",
    properties: {
      value: { type: "string" },
    },
    required: ["value"],
    additionalProperties: false,
  } as const;

  async call(input: unknown): Promise<unknown> {
    return { echoed: input };
  }
}

class ContextCapturingTool implements AgentTool {
  name = "context.capture";
  description = "capture runtime context";
  inputSchema = { type: "object", additionalProperties: false } as const;
  seenContext: unknown;

  async call(_input: unknown, context?: unknown): Promise<unknown> {
    this.seenContext = context;
    return { ok: true };
  }
}

class StubbedTool implements AgentTool {
  name = "file.read";
  description = "read file";
  stubByDefault = true;
  inputSchema = {
    type: "object",
    properties: {
      cached: { enum: ["turn", "persist"] },
    },
    required: ["cached"],
    additionalProperties: false,
  } as const;

  async call(): Promise<unknown> {
    return {
      content: "第一行\n第二行",
    };
  }
}

class NamedResultTool implements AgentTool {
  description: string;
  inputSchema = { type: "object", additionalProperties: false } as const;

  constructor(
    readonly name: string,
    private readonly output: unknown,
  ) {
    this.description = `${name} test tool`;
  }

  async call(): Promise<unknown> {
    return this.output;
  }
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

class FakeTurnSummarizer implements TurnSummarizerLike {
  calls: AgentMessage[][] = [];
  private readonly pendingResolvers: Array<() => void> = [];

  summarizeTurn(messages: AgentMessage[]): Promise<void> {
    this.calls.push(messages);
    return new Promise((resolve) => {
      this.pendingResolvers.push(resolve);
    });
  }

  async applyStoredSummaries(messages: AgentMessage[]): Promise<boolean> {
    for (const message of messages) {
      if (message.role === "tool" && message.blob?.cached === "turn" && !message.blob.summarized) {
        message.content = message.content.replace(
          '{"content":"第一行\\n第二行"}',
          "摘要后的文件内容",
        ).replace("cached=turn", "cached=turn summarized=true");
        message.blob = { ...message.blob, summarized: true };
        return true;
      }
    }
    return false;
  }

  resolveNext(): void {
    const resolve = this.pendingResolvers.shift();
    resolve?.();
  }
}

describe("AgentRuntime", () => {
  it("adds default system prompt sections to LLM requests without persisting them", async () => {
    const seenMessages: AgentMessage[][] = [];
    const runtime = new AgentRuntime(
      {
        async complete(messages: AgentMessage[]) {
          seenMessages.push(messages.map((message) => ({ ...message })));
          return {
            message: { role: "assistant" as const, content: "ok" },
            toolCalls: [],
          };
        },
      },
      new ToolRegistry([new FakeTool()]),
    );

    const result = await runtime.runWithMessages([
      { role: "user", content: "执行一个流程，使用两个tool调用" },
    ]);

    expect(seenMessages).toHaveLength(1);
    expect(seenMessages[0]).toEqual([
      {
        role: "system",
        content: expect.stringContaining("structured tool calls"),
      },
      {
        role: "user",
        content: "执行一个流程，使用两个tool调用",
      },
    ]);
    expect(result.messages).toEqual([
      { role: "user", content: "执行一个流程，使用两个tool调用" },
      { role: "assistant", content: "ok" },
    ]);
  });

  it("passes the configured blob store into the LLM client", async () => {
    const blobStore = new MemoryBlobStore();
    let seenOptions: unknown;
    const runtime = new AgentRuntime(
      {
        async complete(_messages: AgentMessage[], _tools: unknown[], options?: unknown) {
          seenOptions = options;
          return {
            message: { role: "assistant" as const, content: "ok" },
          };
        },
      },
      new ToolRegistry(),
      { blobStore },
    );

    await runtime.runWithMessages([{ role: "user", content: "hello" }]);

    expect(seenOptions).toEqual({ blobStore });
  });

  it("executes tool calls and returns the final assistant message", async () => {
    const client = {
      async complete(messages: AgentMessage[], tools: unknown[]) {
        void tools;
        const lastMessage = messages[messages.length - 1];

        if (lastMessage.role === "user") {
          return {
            message: {
              role: "assistant",
              content: "calling tool",
            },
            toolCalls: [
              {
                id: "call-1",
                name: "echo",
                arguments: {
                  value: "test",
                },
              },
            ],
          };
        }

        return {
          message: {
            role: "assistant",
            content: "done",
          },
          toolCalls: [],
        };
      },
    };

    const runtime = new AgentRuntime(client, new ToolRegistry([new FakeTool()]));
    const result = await runtime.run("测试");

    expect(result.messages.at(-1)).toEqual({
      role: "assistant",
      content: "done",
    });
    expect(result).not.toHaveProperty("bubbles");
  });

  it("limits repeated LLM/tool loops with maxTimes", async () => {
    const client = {
      async complete() {
        return {
          message: { role: "assistant" as const, content: "calling tool" },
          toolCalls: [
            {
              id: "call-loop",
              name: "echo",
              arguments: {
                value: "again",
              },
            },
          ],
        };
      },
    };
    const runtime = new AgentRuntime(client, new ToolRegistry([new FakeTool()]), {
      maxTimes: 1,
    });

    await expect(runtime.run("loop")).rejects.toThrow("AgentRuntime exceeded maxTimes: 1");
  });

  it("passes thread context into tool calls", async () => {
    const tool = new ContextCapturingTool();
    const client = {
      async complete(messages: AgentMessage[]) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === "user") {
          return {
            message: { role: "assistant" as const, content: "calling tool" },
            toolCalls: [
              {
                id: "tool-ctx",
                name: "context.capture",
                arguments: {},
              },
            ],
          };
        }

        return {
          message: { role: "assistant" as const, content: "done" },
          toolCalls: [],
        };
      },
    };
    const runtime = new AgentRuntime(client, new ToolRegistry([tool]));

    await runtime.runWithMessages([{ role: "user", content: "hello" }], () => {}, {
      threadId: "thread-ctx",
    });

    expect(tool.seenContext).toEqual({
      threadId: "thread-ctx",
      toolCallId: "tool-ctx",
    });
  });

  it("runs two tool calls after assistant text and sends both results to the final LLM turn", async () => {
    const seenTurns: AgentMessage[][] = [];
    const events: unknown[] = [];
    const toolCalls = [
      {
        id: "call-frontmost",
        name: "app.frontmost",
        arguments: {},
      },
      {
        id: "call-clipboard",
        name: "clipboard.read",
        arguments: {},
      },
    ];
    const client = {
      async complete(messages: AgentMessage[]) {
        seenTurns.push(messages.map((message) => ({ ...message })));
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === "user") {
          return {
            message: { role: "assistant" as const, content: "我会读取前台 App 和剪贴板。" },
            toolCalls,
          };
        }

        return {
          message: { role: "assistant" as const, content: "两个 tool 都已完成。" },
          toolCalls: [],
        };
      },
    };
    const runtime = new AgentRuntime(
      client,
      new ToolRegistry([
        new NamedResultTool("app.frontmost", { name: "Finder", bundleId: "com.apple.finder" }),
        new NamedResultTool("clipboard.read", { text: "clipboard text" }),
      ]),
    );

    const result = await runtime.runWithMessages(
      [{ role: "user", content: "执行一个流程，使用两个tool调用" }],
      (event) => events.push(event),
    );

    expect(seenTurns).toHaveLength(2);
    expect(seenTurns[1].slice(-3)).toEqual([
      {
        role: "assistant",
        content: "我会读取前台 App 和剪贴板。",
        toolCalls,
      },
      {
        role: "tool",
        toolCallId: "call-frontmost",
        name: "app.frontmost",
        content: JSON.stringify({ name: "Finder", bundleId: "com.apple.finder" }),
      },
      {
        role: "tool",
        toolCallId: "call-clipboard",
        name: "clipboard.read",
        content: JSON.stringify({ text: "clipboard text" }),
      },
    ]);
    expect(events).toEqual([
      {
        type: "assistant_message_start",
        messageId: "assistant-1",
        payload: { role: "assistant" },
      },
      {
        type: "assistant_message_delta",
        messageId: "assistant-1",
        payload: { text: "我会读取前台 App 和剪贴板。" },
      },
      {
        type: "assistant_message_end",
        messageId: "assistant-1",
        payload: { status: "completed" },
      },
      {
        type: "tool_call",
        toolCallId: "call-frontmost",
        toolName: "app.frontmost",
        input: {},
      },
      {
        type: "tool_result",
        toolCallId: "call-frontmost",
        toolName: "app.frontmost",
        status: "success",
        output: JSON.stringify({ name: "Finder", bundleId: "com.apple.finder" }),
        durationMs: expect.any(Number),
      },
      {
        type: "tool_call",
        toolCallId: "call-clipboard",
        toolName: "clipboard.read",
        input: {},
      },
      {
        type: "tool_result",
        toolCallId: "call-clipboard",
        toolName: "clipboard.read",
        status: "success",
        output: JSON.stringify({ text: "clipboard text" }),
        durationMs: expect.any(Number),
      },
      {
        type: "assistant_message_start",
        messageId: "assistant-2",
        payload: { role: "assistant" },
      },
      {
        type: "assistant_message_delta",
        messageId: "assistant-2",
        payload: { text: "两个 tool 都已完成。" },
      },
      {
        type: "assistant_message_end",
        messageId: "assistant-2",
        payload: { status: "completed" },
      },
    ]);
    expect(result.messages.at(-1)).toEqual({
      role: "assistant",
      content: "两个 tool 都已完成。",
    });
  });

  it("stores cached tool results as blobs and sends stub-wrapped content to the next LLM turn", async () => {
    const seenTurns: AgentMessage[][] = [];
    const client = {
      async complete(messages: AgentMessage[], tools: unknown[]) {
        void tools;
        seenTurns.push(messages.map((message) => ({ ...message })));
        const lastMessage = messages[messages.length - 1];

        if (lastMessage.role === "user") {
          return {
            message: {
              role: "assistant" as const,
              content: "reading",
            },
            toolCalls: [
              {
                id: "call-read",
                name: "file.read",
                arguments: { cached: "turn" },
              },
            ],
          };
        }

        return {
          message: {
            role: "assistant" as const,
            content: "done",
          },
          toolCalls: [],
        };
      },
    };
    const blobStore = new MemoryBlobStore();
    const runtime = new AgentRuntime(client, new ToolRegistry([new StubbedTool()]), {
      blobStore,
    });

    const result = await runtime.run("读文件");

    expect(blobStore.records).toEqual([
      {
        id: "blob-1",
        kind: "tool_result",
        size: Buffer.byteLength('{"content":"第一行\\n第二行"}', "utf8"),
        path: "/tmp/blob-1.txt",
      },
    ]);
    const toolBody = '{"content":"第一行\\n第二行"}';
    const expectedToolContent =
      `[STUB id=blob-1 kind=tool_result cached=turn size=${Buffer.byteLength(toolBody, "utf8")} path="/tmp/blob-1.txt"]\n` +
      '{"content":"第一行\\n第二行"}\n' +
      "[/STUB]";
    expect(seenTurns[1].at(-1)).toEqual({
      role: "tool",
      toolCallId: "call-read",
      name: "file.read",
      content: expectedToolContent,
      blob: { id: "blob-1", cached: "turn" },
    });
    expect(result.messages.find((message) => message.role === "tool")).toEqual(
      seenTurns[1].at(-1),
    );
  });

  it("awaits pending turn summaries and applies them before the next LLM call", async () => {
    const seenTurns: AgentMessage[][] = [];
    const client = {
      async complete(messages: AgentMessage[]) {
        seenTurns.push(messages.map((message) => ({ ...message })));
        if (messages.at(-1)?.role === "user") {
          return {
            message: { role: "assistant" as const, content: "reading" },
            toolCalls: [
              { id: "call-read", name: "file.read", arguments: { cached: "turn" } },
            ],
          };
        }
        return {
          message: { role: "assistant" as const, content: "done" },
          toolCalls: [],
        };
      },
    };
    const blobStore = new MemoryBlobStore();
    const summarizer = new FakeTurnSummarizer();
    const runtime = new AgentRuntime(client, new ToolRegistry([new StubbedTool()]), {
      blobStore,
      turnSummarizer: summarizer,
    });
    const firstRun = await runtime.runWithMessages([{ role: "user", content: "第一轮" }]);
    const secondRunPromise = runtime.runWithMessages([
      ...firstRun.messages,
      { role: "user", content: "第二轮" },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seenTurns).toHaveLength(2);

    summarizer.resolveNext();
    await secondRunPromise;

    expect(seenTurns[2].find((message) => message.role === "tool")).toMatchObject({
      content:
        '[STUB id=blob-1 kind=tool_result cached=turn summarized=true size=34 path="/tmp/blob-1.txt"]\n' +
        "摘要后的文件内容\n" +
        "[/STUB]",
      blob: { id: "blob-1", cached: "turn", summarized: true },
    });
  });

  it("forwards multiple LLM text deltas in order", async () => {
    const events: unknown[] = [];
    const streamEvents: LLMStreamEvent[] = [
      { type: "text_delta", text: "这" },
      { type: "text_delta", text: "是" },
      { type: "text_delta", text: "真" },
      { type: "text_delta", text: "流" },
      { type: "text_delta", text: "式" },
      {
        type: "message_end",
        message: {
          role: "assistant",
          content: "这是真流式",
        },
      },
    ];
    const client = {
      async *stream() {
        yield* streamEvents;
      },
    };

    const runtime = new AgentRuntime(client, new ToolRegistry());
    const result = await runtime.runWithMessages([{ role: "user", content: "stream" }], (event) => {
      events.push(event);
    });

    expect(events).toEqual([
      {
        type: "assistant_message_start",
        messageId: "assistant-1",
        payload: { role: "assistant" },
      },
      {
        type: "assistant_message_delta",
        messageId: "assistant-1",
        payload: { text: "这" },
      },
      {
        type: "assistant_message_delta",
        messageId: "assistant-1",
        payload: { text: "是" },
      },
      {
        type: "assistant_message_delta",
        messageId: "assistant-1",
        payload: { text: "真" },
      },
      {
        type: "assistant_message_delta",
        messageId: "assistant-1",
        payload: { text: "流" },
      },
      {
        type: "assistant_message_delta",
        messageId: "assistant-1",
        payload: { text: "式" },
      },
      {
        type: "assistant_message_end",
        messageId: "assistant-1",
        payload: { status: "completed" },
      },
    ]);
    expect(result.messages.at(-1)).toEqual({
      role: "assistant",
      content: "这是真流式",
    });
    expect(result).not.toHaveProperty("bubbles");
  });

  it("preserves assistant toolCalls in message history and emits minimal assistant streaming events", async () => {
    const seenTurns: AgentMessage[][] = [];
    const events: unknown[] = [];
    const firstToolCalls = [
      {
        id: "call-1",
        name: "echo",
        arguments: {
          value: "from-history",
        },
      },
    ];
    const initialMessages: AgentMessage[] = [
      {
        role: "system",
        content: "你是测试助手",
      },
      {
        role: "user",
        content: "请调用工具",
      },
    ];
    const client = {
      async *stream(messages: AgentMessage[], tools: unknown[]) {
        void tools;
        seenTurns.push(messages.map((message) => ({ ...message })));
        const lastMessage = messages[messages.length - 1];

        if (lastMessage.role === "user") {
          yield {
            type: "text_delta",
            text: "先调用",
          };
          yield {
            type: "text_delta",
            text: "工具",
          };
          yield {
            type: "tool_call",
            toolCall: firstToolCalls[0],
          };
          yield {
            type: "message_end",
            message: {
              role: "assistant",
              content: "先调用工具",
            },
            toolCalls: firstToolCalls,
          };
          return;
        }

        yield {
          type: "text_delta",
          text: "工具",
        };
        yield {
          type: "text_delta",
          text: "已完成",
        };
        yield {
          type: "message_end",
          message: {
            role: "assistant",
            content: "工具已完成",
          },
          toolCalls: [],
        };
      },
    };

    const runtime = new AgentRuntime(client, new ToolRegistry([new FakeTool()]));
    const result = await runtime.runWithMessages(initialMessages, (event) => {
      events.push(event);
    });

    expect(seenTurns[0]).toEqual([
      {
        role: "system",
        content: expect.stringContaining("structured tool calls"),
      },
      ...initialMessages,
    ]);
    expect(seenTurns[1]).toEqual([
      {
        role: "system",
        content: expect.stringContaining("structured tool calls"),
      },
      ...initialMessages,
      {
        role: "assistant",
        content: "先调用工具",
        toolCalls: firstToolCalls,
      },
      {
        role: "tool",
        toolCallId: "call-1",
        name: "echo",
        content: JSON.stringify({
          echoed: {
            value: "from-history",
          },
        }),
      },
    ]);
    expect(result.messages[2]).toEqual({
      role: "assistant",
      content: "先调用工具",
      toolCalls: firstToolCalls,
    });
    expect(events).toEqual([
      {
        type: "assistant_message_start",
        messageId: "assistant-1",
        payload: { role: "assistant" },
      },
      {
        type: "assistant_message_delta",
        messageId: "assistant-1",
        payload: { text: "先调用" },
      },
      {
        type: "assistant_message_delta",
        messageId: "assistant-1",
        payload: { text: "工具" },
      },
      {
        type: "assistant_message_end",
        messageId: "assistant-1",
        payload: { status: "completed" },
      },
      {
        type: "tool_call",
        toolCallId: "call-1",
        toolName: "echo",
        input: {
          value: "from-history",
        },
      },
      {
        type: "tool_result",
        toolCallId: "call-1",
        toolName: "echo",
        status: "success",
        output: JSON.stringify({
          echoed: {
            value: "from-history",
          },
        }),
        durationMs: expect.any(Number),
      },
      {
        type: "assistant_message_start",
        messageId: "assistant-2",
        payload: { role: "assistant" },
      },
      {
        type: "assistant_message_delta",
        messageId: "assistant-2",
        payload: { text: "工具" },
      },
      {
        type: "assistant_message_delta",
        messageId: "assistant-2",
        payload: { text: "已完成" },
      },
      {
        type: "assistant_message_end",
        messageId: "assistant-2",
        payload: { status: "completed" },
      },
    ]);
    expect(result.messages.at(-1)).toEqual({
      role: "assistant",
      content: "工具已完成",
    });
    expect(result).not.toHaveProperty("bubbles");
  });

  it("stops streaming and emits interrupted status when the run signal is aborted", async () => {
    let seenSignal: AbortSignal | undefined;
    const abortController = new AbortController();
    const client: LLMClient = {
      async *stream(_messages, _tools, options): AsyncIterable<LLMStreamEvent> {
        seenSignal = options?.signal;
        yield { type: "text_delta", text: "before abort" };
        abortController.abort();
        yield { type: "text_delta", text: " after abort" };
        yield {
          type: "message_end",
          message: { role: "assistant", content: "before abort after abort" },
        };
      },
    };
    const runtime = new AgentRuntime(client, new ToolRegistry());
    const events: string[] = [];

    await expect(
      runtime.runWithMessages(
        [{ role: "user", content: "hello" }],
        (event) => {
          if (event.type === "assistant_message_delta") events.push(event.payload.text);
          if (event.type === "assistant_message_end") events.push(event.payload.status);
        },
        { signal: abortController.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(seenSignal).toBe(abortController.signal);
    expect(events).toEqual(["before abort", "interrupted"]);
  });

  it("does not append tool results after the run signal is aborted during a tool call", async () => {
    const abortController = new AbortController();
    const client: LLMClient = {
      async *stream(): AsyncIterable<LLMStreamEvent> {
        yield {
          type: "tool_call",
          toolCall: { id: "tc-1", name: "slow.tool", arguments: {} },
        };
        yield {
          type: "message_end",
          message: { role: "assistant", content: "calling tool" },
          toolCalls: [{ id: "tc-1", name: "slow.tool", arguments: {} }],
        };
      },
    };
    const registry = new ToolRegistry();
    registry.register({
      name: "slow.tool",
      description: "slow tool",
      inputSchema: { type: "object", properties: {} },
      async call() {
        abortController.abort();
        return "late result";
      },
    });
    const runtime = new AgentRuntime(client, registry);
    const events: string[] = [];

    await expect(
      runtime.runWithMessages(
        [{ role: "user", content: "hello" }],
        (event) => {
          if (event.type === "tool_call") events.push("tool_call");
          if (event.type === "tool_result") events.push("tool_result");
          if (event.type === "assistant_message_end") events.push(event.payload.status);
        },
        { signal: abortController.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(events).toEqual(["completed", "tool_call"]);
  });

  it("invokes onMetaToolActivate the first time use_tools is called and returns the activation result", async () => {
    const activations: string[] = [];
    const events: unknown[] = [];

    // LLM: first turn returns use_tools call, second turn returns text
    const client = {
      async complete(messages: AgentMessage[]) {
        const last = messages[messages.length - 1];
        if (last.role === "user") {
          return {
            message: { role: "assistant" as const, content: "activating tools" },
            toolCalls: [{ id: "meta-1", name: META_TOOL_NAME, arguments: {} }],
          };
        }
        return {
          message: { role: "assistant" as const, content: "tools are ready" },
          toolCalls: [],
        };
      },
    };

    const registry = new ToolRegistry([MetaToolUseTool.create(undefined)]);
    const runtime = new AgentRuntime(client, registry, {
      onMetaToolActivate: async (threadId: string) => {
        activations.push(threadId);
      },
      isThreadActivated: () => false,
    });

    const result = await runtime.runWithMessages(
      [{ role: "user", content: "do something" }],
      (event) => events.push(event),
      { threadId: "thread-A" },
    );

    expect(activations).toEqual(["thread-A"]);

    const toolResultEvent = events.find(
      (e) => (e as { type: string }).type === "tool_result" &&
        (e as { toolName: string }).toolName === META_TOOL_NAME,
    ) as { output: string } | undefined;
    expect(toolResultEvent?.output).toContain("Tools activated");

    expect(result.messages.at(-1)).toEqual({
      role: "assistant",
      content: "tools are ready",
    });
  });

  it("skips activation callback and returns the already-active result on repeat calls", async () => {
    const activations: string[] = [];
    const events: unknown[] = [];

    const client = {
      async complete(messages: AgentMessage[]) {
        const last = messages[messages.length - 1];
        if (last.role === "user") {
          return {
            message: { role: "assistant" as const, content: "activating tools" },
            toolCalls: [{ id: "meta-2", name: META_TOOL_NAME, arguments: {} }],
          };
        }
        return {
          message: { role: "assistant" as const, content: "done" },
          toolCalls: [],
        };
      },
    };

    const registry = new ToolRegistry([MetaToolUseTool.create(undefined)]);
    const runtime = new AgentRuntime(client, registry, {
      onMetaToolActivate: async (threadId: string) => {
        activations.push(threadId);
      },
      isThreadActivated: () => true, // already activated
    });

    await runtime.runWithMessages(
      [{ role: "user", content: "do something" }],
      (event) => events.push(event),
      { threadId: "thread-B" },
    );

    expect(activations).toHaveLength(0);

    const toolResultEvent = events.find(
      (e) => (e as { type: string }).type === "tool_result" &&
        (e as { toolName: string }).toolName === META_TOOL_NAME,
    ) as { output: string } | undefined;
    expect(toolResultEvent?.output).toBe(META_TOOL_ALREADY_ACTIVE_RESULT);
  });

  it("skips permission policy entirely for meta-tool calls", async () => {
    let permissionChecks = 0;

    const countingPolicy: PermissionPolicy = {
      async check(_request: PermissionRequest) {
        permissionChecks += 1;
        return "allow" as const;
      },
      async resolveAsk(_request: PermissionRequest): Promise<PermissionResolution> {
        return { decision: "allow" };
      },
      async remember(): Promise<void> {},
    };

    const client = {
      async complete(messages: AgentMessage[]) {
        const last = messages[messages.length - 1];
        if (last.role === "user") {
          return {
            message: { role: "assistant" as const, content: "activating" },
            toolCalls: [{ id: "meta-3", name: META_TOOL_NAME, arguments: {} }],
          };
        }
        return {
          message: { role: "assistant" as const, content: "done" },
          toolCalls: [],
        };
      },
    };

    const registry = new ToolRegistry([MetaToolUseTool.create(undefined)]);
    const runtime = new AgentRuntime(client, registry, {
      permissionPolicy: countingPolicy,
      isThreadActivated: () => false,
    });

    await runtime.runWithMessages(
      [{ role: "user", content: "activate" }],
      () => {},
      { threadId: "thread-C" },
    );

    expect(permissionChecks).toBe(0);
  });
});
