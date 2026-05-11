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

describe("AgentRuntime", () => {
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
});
