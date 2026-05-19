import {
  generateText,
} from "ai";
import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import type { LLMClient, LLMCompleteOptions, LLMCompletion } from "./LLMClient.ts";
import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";
import type { OpenAIApiType } from "../config/ModelSettings.ts";
import type { NetworkLogger } from "../logging/NetworkLogger.ts";
import { createLoggingFetch } from "../logging/createLoggingFetch.ts";
import { resolveOpenAIApiKey, resolveOpenAIBaseURL } from "./OpenAIConfig.ts";
import { hasImageContent, sanitizeToolName, toVercelMessages, toVercelTools } from "./VercelAdapters.ts";

type OpenAIProviderSettings = NonNullable<Parameters<typeof createOpenAI>[0]>;
type VercelRequest = Parameters<typeof generateText>[0];
type VercelResponse = Awaited<ReturnType<typeof generateText>>;

export type VercelClientOptions = OpenAIProviderSettings & {
  model?: string;
  api?: OpenAIApiType;
  networkLogger?: NetworkLogger;
};

type VercelClientDependencies = {
  createOpenAI?: typeof createOpenAI;
  generateText?: typeof generateText;
};

export class VercelClient implements LLMClient {
  private readonly model;
  private readonly api;
  private readonly generateText;

  constructor(
    options: VercelClientOptions = {},
    dependencies: VercelClientDependencies = {},
  ) {
    const {
      model = "gpt-5-mini",
      api = "chat",
      apiKey,
      baseURL,
      networkLogger,
      fetch: fetchOverride,
      ...providerSettings
    } = options;
    const createOpenAIProvider = dependencies.createOpenAI ?? createOpenAI;
    const fetchImpl = networkLogger
      ? createLoggingFetch({
          logger: networkLogger,
          baseFetch: fetchOverride as typeof fetch | undefined,
        })
      : fetchOverride;
    const provider = createOpenAIProvider({
      ...providerSettings,
      apiKey: resolveOpenAIApiKey({ apiKey }),
      baseURL: resolveOpenAIBaseURL({ baseURL }),
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
    this.api = api;
    this.model = selectLanguageModel(provider, api, model);
    this.generateText = dependencies.generateText ?? generateText;
  }

  async complete(
    messages: AgentMessage[],
    tools: RegisteredTool[],
    options?: LLMCompleteOptions,
  ): Promise<LLMCompletion> {
    if (this.api === "completion" && hasImageContent(messages)) {
      throw new Error("OpenAI completion API does not support image content. Use chat or responses.");
    }
    const reverseToolNames = new Map(
      tools.map((t) => [sanitizeToolName(t.name), t.name])
    );
    const request: VercelRequest = {
      model: this.model,
      messages: await toVercelMessages(messages, options),
      tools: toVercelTools(tools),
    };
    const response: VercelResponse = await this.generateText(request);

    return {
      message: {
        role: "assistant",
        content: response.text,
      },
      toolCalls: response.toolCalls.map((toolCall) => ({
        id: toolCall.toolCallId,
        name: reverseToolNames.get(toolCall.toolName) ?? toolCall.toolName,
        arguments: toolCall.input as Record<string, unknown>,
      })),
    };
  }
}

function selectLanguageModel(provider: OpenAIProvider, api: OpenAIApiType, model: string) {
  switch (api) {
    case "chat":
      return provider.chat(model);
    case "completion":
      return provider.completion(model);
    case "responses":
      return provider.responses(model);
  }
}
