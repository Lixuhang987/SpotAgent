import {
  generateText,
  tool,
  type JSONValue,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { LLMClient, LLMCompletion } from "./LLMClient.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";

type VercelModelId = Parameters<ReturnType<typeof createOpenAI>>[0];
type OpenAIProviderSettings = NonNullable<Parameters<typeof createOpenAI>[0]>;
type VercelRequest = Parameters<typeof generateText>[0];
type VercelResponse = Awaited<ReturnType<typeof generateText>>;

export type VercelClientOptions = OpenAIProviderSettings & {
  model?: VercelModelId;
};

export function resolveOpenAIApiKey(
  options: Pick<OpenAIProviderSettings, "apiKey">
): string {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (apiKey) {
    return apiKey;
  }

  throw new Error("Missing OPENAI_API_KEY. Set it before starting HandAgent.");
}

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
        inputSchema: registeredTool.inputSchema,
      }),
    ])
  ) as ToolSet;
}

export class VercelClient implements LLMClient {
  private readonly provider;
  private readonly model: VercelModelId;

  constructor(options: VercelClientOptions = {}) {
    const { model = "gpt-5-mini", apiKey, ...providerSettings } = options;
    this.provider = createOpenAI({
      ...providerSettings,
      apiKey: resolveOpenAIApiKey({ apiKey }),
    });
    this.model = model;
  }

  async complete(messages: AgentMessage[], tools: RegisteredTool[]): Promise<LLMCompletion> {
    const request: VercelRequest = {
      model: this.provider(this.model),
      messages: toVercelMessages(messages),
      tools: toVercelTools(tools),
    };
    const response: VercelResponse = await generateText(request);

    return {
      message: {
        role: "assistant",
        content: response.text,
      },
      toolCalls: response.toolCalls.map((toolCall) => ({
        id: toolCall.toolCallId,
        name: toolCall.toolName,
        arguments: toolCall.input as Record<string, unknown>,
      })),
    };
  }
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
