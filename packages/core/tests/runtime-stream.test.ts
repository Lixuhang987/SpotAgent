import { describe, expect, it } from "vitest";
import { AgentRuntime } from "../src/runtime/AgentRuntime";
import { ToolRegistry } from "../src/tools/ToolRegistry";
import type { AgentTool } from "../src/tools/AgentTool";
import type { AgentMessage } from "../src/runtime/AgentMessage";
import type { LLMStreamEvent } from "../src/llm/LLMClient";

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

describe("AgentRuntime runWithMessages", () => {
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
    expect(result.bubbles).toEqual([
      {
        id: "assistant-1",
        text: "这是真流式",
      },
    ]);
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

    expect(seenTurns[0]).toEqual(initialMessages);
    expect(seenTurns[1]).toEqual([
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
    expect(result.bubbles).toEqual([
      {
        id: "assistant-1",
        text: "先调用工具",
      },
      {
        id: "assistant-2",
        text: "工具已完成",
      },
    ]);
  });
});
