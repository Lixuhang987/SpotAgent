import { describe, expect, it } from "vitest";
import { AgentRuntime } from "../src/runtime/AgentRuntime";
import { ToolRegistry } from "../src/tools/ToolRegistry";
import type { AgentTool } from "../src/tools/AgentTool";
import type { AgentMessage } from "../src/runtime/AgentMessage";
import type { BlobRecord } from "../src/blob/BlobRecord";
import type { BlobStore } from "../src/blob/BlobStore";
import type { TurnSummarizerLike } from "../src/runtime/TurnSummarizer";

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
    expect(result.bubbles.at(-1)).toEqual({
      id: "assistant-2",
      text: "done",
    });
  });

  it("passes session context into tool calls", async () => {
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
      sessionId: "session-ctx",
    });

    expect(tool.seenContext).toEqual({
      sessionId: "session-ctx",
      toolCallId: "tool-ctx",
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
});
