import type { AgentMessage } from "./AgentMessage";
import type { ToolCallEnvelope } from "./ToolCallEnvelope";
import type { LLMClient } from "../llm/LLMClient";
import { ToolRegistry } from "../tools/ToolRegistry";

export type AgentBubble = {
  id: string;
  text: string;
};

export type AgentRunResult = {
  messages: AgentMessage[];
  bubbles: AgentBubble[];
};

export class AgentRuntime {
  private readonly maxTurns: number;

  constructor(
    private readonly client: LLMClient,
    private readonly toolRegistry: ToolRegistry,
    options?: { maxTurns?: number }
  ) {
    this.maxTurns = options?.maxTurns ?? 8;
  }

  async run(userInput: string): Promise<AgentRunResult> {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: userInput,
      },
    ];
    const bubbles: AgentBubble[] = [];
    let assistantCount = 0;

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      const completion = await this.client.complete(messages, this.toolRegistry.list());
      messages.push(completion.message);
      if (completion.message.role === "assistant") {
        assistantCount += 1;
        bubbles.push({
          id: `assistant-${assistantCount}`,
          text: completion.message.content,
        });
      }

      const toolCalls = completion.toolCalls ?? [];
      if (toolCalls.length === 0) {
        return {
          messages,
          bubbles,
        };
      }

      for (const toolCall of toolCalls) {
        const tool = this.toolRegistry.get(toolCall.name);
        if (!tool) {
          throw new Error(`Unknown tool: ${toolCall.name}`);
        }

        const result = await tool.call(toolCall.arguments);
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: serializeToolResult(result),
        });
      }
    }

    throw new Error(`AgentRuntime exceeded maxTurns: ${this.maxTurns}`);
  }
}

function serializeToolResult(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable tool result]";
  }
}
