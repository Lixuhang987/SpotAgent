import {
  generateText,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { LLMClient, LLMCompletion } from "./LLMClient.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";
import { resolveOpenAIApiKey, resolveOpenAIBaseURL } from "./OpenAIConfig.ts";
import { toVercelMessages, toVercelTools } from "./VercelAdapters.ts";

type VercelModelId = Parameters<ReturnType<typeof createOpenAI>>[0];
type OpenAIProviderSettings = NonNullable<Parameters<typeof createOpenAI>[0]>;
type VercelRequest = Parameters<typeof generateText>[0];
type VercelResponse = Awaited<ReturnType<typeof generateText>>;

export type VercelClientOptions = OpenAIProviderSettings & {
  model?: VercelModelId;
};

export class VercelClient implements LLMClient {
  private readonly provider;
  private readonly model: VercelModelId;

  constructor(options: VercelClientOptions = {}) {
    const { model = "gpt-5-mini", apiKey, baseURL, ...providerSettings } = options;
    this.provider = createOpenAI({
      ...providerSettings,
      apiKey: resolveOpenAIApiKey({ apiKey }),
      baseURL: resolveOpenAIBaseURL({ baseURL }),
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
