import {
  streamText,
} from "ai";
import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import type { LLMClient, LLMCompleteOptions, LLMCompletion, LLMStreamEvent } from "./LLMClient.ts";
import { collectLLMStream } from "./LLMClient.ts";
import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";
import type { OpenAIApiType } from "../config/ModelSettings.ts";
import type { NetworkLogger } from "../logging/NetworkLogger.ts";
import { createLoggingFetch } from "../logging/createLoggingFetch.ts";
import { resolveOpenAIApiKey, resolveOpenAIBaseURL } from "./OpenAIConfig.ts";
import { hasImageContent, sanitizeToolName, toVercelMessages, toVercelTools } from "./VercelAdapters.ts";

type OpenAIProviderSettings = NonNullable<Parameters<typeof createOpenAI>[0]>;
type VercelStreamRequest = Parameters<typeof streamText>[0];

export type VercelClientOptions = OpenAIProviderSettings & {
  model?: string;
  api?: OpenAIApiType;
  networkLogger?: NetworkLogger;
};

type VercelClientDependencies = {
  createOpenAI?: typeof createOpenAI;
  streamText?: typeof streamText;
};

export class VercelClient implements LLMClient {
  private readonly model;
  private readonly api;
  private readonly streamText;

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
    this.streamText = dependencies.streamText ?? streamText;
  }

  async complete(
    messages: AgentMessage[],
    tools: RegisteredTool[],
    options?: LLMCompleteOptions,
  ): Promise<LLMCompletion> {
    return collectLLMStream(this.stream(messages, tools, options));
  }

  async *stream(
    messages: AgentMessage[],
    tools: RegisteredTool[],
    options?: LLMCompleteOptions,
  ): AsyncIterable<LLMStreamEvent> {
    if (this.api === "completion" && hasImageContent(messages)) {
      throw new Error("OpenAI completion API does not support image content. Use chat or responses.");
    }
    const reverseToolNames = new Map(
      tools.map((t) => [sanitizeToolName(t.name), t.name])
    );
    const request: VercelStreamRequest = {
      model: this.model,
      messages: await toVercelMessages(messages, options),
      tools: toVercelTools(tools),
    };
    const response = this.streamText(request);
    let content = "";
    const toolCalls: NonNullable<LLMCompletion["toolCalls"]> = [];

    for await (const part of response.fullStream) {
      switch (part.type) {
        case "text-delta":
          content += part.text;
          yield {
            type: "text_delta",
            text: part.text,
          };
          break;
        case "tool-call": {
          const toolCall = {
            id: part.toolCallId,
            name: reverseToolNames.get(part.toolName) ?? part.toolName,
            arguments: part.input as Record<string, unknown>,
          };
          toolCalls.push(toolCall);
          yield {
            type: "tool_call",
            toolCall,
          };
          break;
        }
      }
    }

    yield {
      type: "message_end",
      message: {
        role: "assistant",
        content,
      },
      toolCalls,
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
