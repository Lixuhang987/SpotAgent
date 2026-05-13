import { afterEach, describe, expect, it } from "vitest";
import {
  resolveOpenAIApiKey,
  toVercelMessages,
  toVercelTools,
} from "../src/llm/VercelClient";
import type { AgentMessage } from "../src/runtime/AgentMessage";

const originalOpenAIKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalOpenAIKey === undefined) {
    delete process.env.OPENAI_API_KEY;
    return;
  }

  process.env.OPENAI_API_KEY = originalOpenAIKey;
});

describe("VercelClient adapters", () => {
  it("converts agent messages to AI SDK model messages", () => {
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

    expect(toVercelMessages(messages)).toEqual([
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
            toolName: "file.read",
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
            toolName: "file.read",
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

  it("wraps registered tools as AI SDK tools", () => {
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

    expect(Object.keys(tools)).toEqual(["file.read"]);
    expect(tools["file.read"]).toMatchObject({
      description: "读取文件",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    });
  });

  it("prefers explicit apiKey and falls back to OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "env-key";

    expect(resolveOpenAIApiKey({ apiKey: "explicit-key" })).toBe("explicit-key");
    expect(resolveOpenAIApiKey({})).toBe("env-key");
  });

  it("throws a clear error when no OpenAI API key is configured", () => {
    delete process.env.OPENAI_API_KEY;

    expect(() => resolveOpenAIApiKey({})).toThrow(
      "Missing OPENAI_API_KEY. Set it before starting HandAgent."
    );
  });
});
