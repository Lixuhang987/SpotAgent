import { jsonSchema, tool, type JSONValue, type ModelMessage, type ToolSet } from "ai";
import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";

export function toVercelMessages(messages: AgentMessage[]): ModelMessage[] {
  return messages.map((message) => {
    switch (message.role) {
      case "user":
        return {
          role: "user",
          content: message.content,
        };
      case "assistant": {
        if (!message.toolCalls || message.toolCalls.length === 0) {
          return {
            role: "assistant",
            content: message.content,
          };
        }

        return {
          role: "assistant",
          content: [
            ...(message.content
              ? [
                  {
                    type: "text" as const,
                    text: message.content,
                  },
                ]
              : []),
            ...message.toolCalls.map((toolCall) => ({
              type: "tool-call" as const,
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              input: toolCall.arguments,
            })),
          ],
        };
      }
      case "tool":
        return {
          role: "tool",
          content: [
            {
              type: "tool-result" as const,
              toolCallId: message.toolCallId,
              toolName: message.name,
              output: toToolResultOutput(message.content),
            },
          ],
        };
      case "system":
        return {
          role: "system",
          content: message.content,
        };
    }
  });
}

export function toVercelTools(tools: RegisteredTool[]): ToolSet {
  return Object.fromEntries(
    tools.map((registeredTool) => [
      registeredTool.name,
      tool({
        description: registeredTool.description,
        inputSchema: jsonSchema(registeredTool.inputSchema as Parameters<typeof jsonSchema>[0]),
      }),
    ])
  ) as ToolSet;
}

function toToolResultOutput(content: string) {
  try {
    return {
      type: "json" as const,
      value: JSON.parse(content) as JSONValue,
    };
  } catch {
    return {
      type: "text" as const,
      value: content,
    };
  }
}
