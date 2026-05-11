import { describe, expect, it } from "vitest";
import { AgentRuntime } from "../src/runtime/AgentRuntime";
import { ToolRegistry } from "../src/tools/ToolRegistry";
import type { AgentTool } from "../src/tools/AgentTool";
import type { AgentMessage } from "../src/runtime/AgentMessage";

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
      async complete(messages: AgentMessage[], tools: unknown[]) {
        void tools;
        seenTurns.push(messages.map((message) => ({ ...message })));
        const lastMessage = messages[messages.length - 1];

        if (lastMessage.role === "user") {
          return {
            message: {
              role: "assistant",
              content: "先调用工具",
            },
            toolCalls: firstToolCalls,
          };
        }

        return {
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
        payload: { text: "先调用工具" },
      },
      {
        type: "assistant_message_end",
        messageId: "assistant-1",
        payload: { status: "completed" },
      },
      {
        type: "assistant_message_start",
        messageId: "assistant-2",
        payload: { role: "assistant" },
      },
      {
        type: "assistant_message_delta",
        messageId: "assistant-2",
        payload: { text: "工具已完成" },
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
