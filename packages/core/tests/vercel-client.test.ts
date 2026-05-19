import { describe, expect, it, vi } from "vitest";
import { asSchema } from "ai";
import {
  resolveOpenAIApiKey,
} from "../src/llm/OpenAIConfig";
import {
  sanitizeToolName,
  toVercelMessages,
  toVercelTools,
} from "../src/llm/VercelAdapters";
import { VercelClient } from "../src/llm/VercelClient";
import type { AgentMessage } from "../src/runtime/AgentMessage";
import type { BlobRecord } from "../src/blob/BlobRecord";
import type { BlobStore } from "../src/blob/BlobStore";

class MemoryBlobStore implements BlobStore {
  records = new Map<string, BlobRecord>();
  contents = new Map<string, Buffer>();

  async put(input: { kind: string; bytes: Buffer; extension: string }): Promise<BlobRecord> {
    const id = `blob-${this.records.size + 1}`;
    const record: BlobRecord = {
      id,
      kind: input.kind,
      size: input.bytes.byteLength,
      path: `/tmp/${id}.${input.extension}`,
    };
    this.records.set(id, record);
    this.contents.set(id, input.bytes);
    return record;
  }

  async get(id: string): Promise<BlobRecord | undefined> {
    return this.records.get(id);
  }

  async readContent(id: string): Promise<Buffer> {
    const content = this.contents.get(id);
    if (!content) throw new Error(`Blob not found: ${id}`);
    return content;
  }

  async setSummary(id: string, summary: string): Promise<void> {
    const record = this.records.get(id);
    if (record) record.summary = summary;
  }
}

describe("VercelClient adapters", () => {
  it("converts agent messages to AI SDK model messages", async () => {
    const messages: AgentMessage[] = [
      {
        role: "system",
        content: "system rule",
      },
      {
        role: "user",
        content: "请读取文件",
      },
      {
        role: "assistant",
        content: "正在调用工具",
        toolCalls: [
          {
            id: "call-1",
            name: "file.read",
            arguments: {
              path: "/tmp/demo.txt",
            },
          },
        ],
      },
      {
        role: "tool",
        toolCallId: "call-1",
        name: "file.read",
        content: "{\"text\":\"hello\"}",
      },
    ];

    await expect(toVercelMessages(messages)).resolves.toEqual([
      {
        role: "system",
        content: "system rule",
      },
      {
        role: "user",
        content: "请读取文件",
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "正在调用工具",
          },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "file_read",
            input: {
              path: "/tmp/demo.txt",
            },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "file_read",
            output: {
              type: "json",
              value: {
                text: "hello",
              },
            },
          },
        ],
      },
    ]);
  });

  it("maps typed image user content into AI SDK image parts", async () => {
    const blobStore = new MemoryBlobStore();
    await blobStore.put({
      kind: "image",
      bytes: Buffer.from("png-bytes"),
      extension: "png",
    });

    await expect(
      toVercelMessages(
        [
          {
            role: "user",
            content: [
              { type: "text", text: "描述图片" },
              { type: "image", blobId: "blob-1", mimeType: "image/png" },
            ],
          },
        ],
        { blobStore },
      ),
    ).resolves.toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "描述图片" },
          { type: "image", image: Buffer.from("png-bytes"), mediaType: "image/png" },
        ],
      },
    ]);
  });

  it("throws clear errors when image content cannot be resolved", async () => {
    const blobStore = new MemoryBlobStore();
    await blobStore.put({
      kind: "tool_result",
      bytes: Buffer.from("text"),
      extension: "txt",
    });
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [{ type: "image", blobId: "blob-1", mimeType: "image/png" }],
      },
    ];

    await expect(toVercelMessages(messages)).rejects.toThrow(
      "Image content requires a BlobStore.",
    );
    await expect(
      toVercelMessages(
        [
          {
            role: "user",
            content: [{ type: "image", blobId: "missing", mimeType: "image/png" }],
          },
        ],
        { blobStore },
      ),
    ).rejects.toThrow("Image blob not found: missing");
    await expect(toVercelMessages(messages, { blobStore })).rejects.toThrow(
      "Blob is not an image: blob-1",
    );
  });

  it("sanitizes tool names so they match OpenAI's ^[a-zA-Z0-9_-]+$ pattern", () => {
    expect(sanitizeToolName("file.read")).toBe("file_read");
    expect(sanitizeToolName("workspace.list")).toBe("workspace_list");
    expect(sanitizeToolName("already_safe-name")).toBe("already_safe-name");
    expect(sanitizeToolName("space here.dot")).toBe("space_here_dot");
  });

  it("wraps registered tools as AI SDK tools whose inputSchema is consumable by the SDK", async () => {
    const tools = toVercelTools([
      {
        name: "file.read",
        description: "读取文件",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
          },
          required: ["path"],
        },
      },
    ]);

    expect(Object.keys(tools)).toEqual(["file_read"]);
    expect(tools["file_read"]?.description).toBe("读取文件");

    const schema = asSchema(tools["file_read"]!.inputSchema);
    const resolvedJsonSchema = await schema.jsonSchema;
    expect(resolvedJsonSchema).toMatchObject({
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    });
  });

  it("returns the explicit apiKey without reading environment variables", () => {
    expect(resolveOpenAIApiKey({ apiKey: "explicit-key" })).toBe("explicit-key");
  });

  it("throws a clear error when no OpenAI API key is configured", () => {
    expect(() => resolveOpenAIApiKey({})).toThrow(
      "Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。"
    );
  });

  it("creates a chat model by default", () => {
    const responses = vi.fn(() => "responses-model");
    const chat = vi.fn(() => "chat-model");
    const completion = vi.fn(() => "completion-model");
    const createOpenAI = vi.fn(() => ({
      responses,
      chat,
      completion,
    }));

    const client = new VercelClient(
      {
        apiKey: "test-key",
        model: "gpt-5-mini",
      },
      { createOpenAI, generateText: vi.fn() as never },
    );

    expect(client).toBeDefined();
    expect(createOpenAI).toHaveBeenCalled();
    expect(chat).toHaveBeenCalledWith("gpt-5-mini");
    expect(responses).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
  });

  it("creates the configured chat model", () => {
    const responses = vi.fn(() => "responses-model");
    const chat = vi.fn(() => "chat-model");
    const completion = vi.fn(() => "completion-model");

    new VercelClient(
      {
        apiKey: "test-key",
        model: "gpt-4.1",
        api: "chat",
      },
      {
        createOpenAI: vi.fn(() => ({
          responses,
          chat,
          completion,
        })),
        generateText: vi.fn() as never,
      },
    );

    expect(chat).toHaveBeenCalledWith("gpt-4.1");
    expect(responses).not.toHaveBeenCalled();
    expect(completion).not.toHaveBeenCalled();
  });

  it("creates the configured completion model", () => {
    const responses = vi.fn(() => "responses-model");
    const chat = vi.fn(() => "chat-model");
    const completion = vi.fn(() => "completion-model");

    new VercelClient(
      {
        apiKey: "test-key",
        model: "gpt-3.5-turbo-instruct",
        api: "completion",
      },
      {
        createOpenAI: vi.fn(() => ({
          responses,
          chat,
          completion,
        })),
        generateText: vi.fn() as never,
      },
    );

    expect(completion).toHaveBeenCalledWith("gpt-3.5-turbo-instruct");
    expect(responses).not.toHaveBeenCalled();
    expect(chat).not.toHaveBeenCalled();
  });

  it("rejects image content when configured for the OpenAI completion API", async () => {
    const generateText = vi.fn(async () => ({
      text: "should not run",
      toolCalls: [],
    }));
    const client = new VercelClient(
      {
        apiKey: "test-key",
        model: "gpt-3.5-turbo-instruct",
        api: "completion",
      },
      {
        createOpenAI: vi.fn(() => ({
          responses: vi.fn(() => "responses-model"),
          chat: vi.fn(() => "chat-model"),
          completion: vi.fn(() => "completion-model"),
        })),
        generateText: generateText as never,
      },
    );

    await expect(
      client.complete(
        [
          {
            role: "user",
            content: [{ type: "image", blobId: "blob-1", mimeType: "image/png" }],
          },
        ],
        [],
      ),
    ).rejects.toThrow("OpenAI completion API does not support image content. Use chat or responses.");
    expect(generateText).not.toHaveBeenCalled();
  });
});
