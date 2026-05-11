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

export type AgentRuntimeEvent =
  | {
      type: "assistant_message_start";
      messageId: string;
      payload: { role: "assistant" };
    }
  | {
      type: "assistant_message_delta";
      messageId: string;
      payload: { text: string };
    }
  | {
      type: "assistant_message_end";
      messageId: string;
      payload: { status: "completed" };
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
    return this.runWithMessages([
      {
        role: "user",
        content: userInput,
      },
    ]);
  }

  async runWithMessages(
    messages: AgentMessage[],
    onEvent: (event: AgentRuntimeEvent) => void = () => {}
  ): Promise<AgentRunResult> {
    const nextMessages = [...messages];
    const bubbles: AgentBubble[] = [];
    let assistantCount = 0;

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      const completion = await this.client.complete(
        nextMessages,
        this.toolRegistry.list()
      );
      const assistantMessage =
        completion.toolCalls && completion.toolCalls.length > 0
          ? {
              ...completion.message,
              toolCalls: completion.toolCalls,
            }
          : completion.message;

      nextMessages.push(assistantMessage);
      if (assistantMessage.role === "assistant") {
        assistantCount += 1;
        const messageId = `assistant-${assistantCount}`;
        onEvent({
          type: "assistant_message_start",
          messageId,
          payload: { role: "assistant" },
        });
        onEvent({
          type: "assistant_message_delta",
          messageId,
          payload: { text: assistantMessage.content },
        });
        onEvent({
          type: "assistant_message_end",
          messageId,
          payload: { status: "completed" },
        });
        bubbles.push({
          id: messageId,
          text: assistantMessage.content,
        });
      }

      const toolCalls = completion.toolCalls ?? [];
      if (toolCalls.length === 0) {
        return {
          messages: nextMessages,
          bubbles,
        };
      }

      for (const toolCall of toolCalls) {
        const tool = this.toolRegistry.get(toolCall.name);
        if (!tool) {
          throw new Error(`Unknown tool: ${toolCall.name}`);
        }

        const result = await tool.call(toolCall.arguments);
        nextMessages.push({
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
