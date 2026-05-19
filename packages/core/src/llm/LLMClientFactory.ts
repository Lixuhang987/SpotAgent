import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ModelSettings, OpenAIApiType, LLMProvider } from "../config/ModelSettings.ts";
import type { NetworkLogger } from "../logging/NetworkLogger.ts";
import type {
  LLMClient,
  LLMClientLike,
  LLMCompleteOptions,
  LLMCompletion,
  LLMStreamEvent,
} from "./LLMClient.ts";
import { collectLLMStream } from "./LLMClient.ts";
import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";
import { hasImageContent, sanitizeToolName, toVercelMessages, toVercelTools } from "./VercelAdapters.ts";
import { VercelClient } from "./VercelClient.ts";

export type LLMProviderCapabilities = {
  streaming: boolean;
  toolCalling: boolean;
  multimodal: boolean;
};

export type LLMClientFactoryOptions = {
  networkLogger?: NetworkLogger;
};

export type LLMClientFactoryResult = {
  client: LLMClientLike;
  capabilities: LLMProviderCapabilities;
};

export type LLMClientFactoryDependencies = {
  createOpenAICompatibleClient?: (settings: OpenAICompatibleClientSettings) => LLMClientLike;
  createAnthropic?: typeof createAnthropic;
  streamText?: typeof streamText;
};

export type OpenAICompatibleClientSettings = {
  model: string;
  apiKey?: string;
  baseURL?: string;
  api: OpenAIApiType;
  networkLogger?: NetworkLogger;
};

export function createLLMClient(
  settings: ModelSettings,
  dependencies: LLMClientFactoryDependencies = {},
  options: LLMClientFactoryOptions = {},
): LLMClientFactoryResult {
  switch (settings.provider) {
    case "anthropic": {
      const capabilities = providerCapabilities(settings);
      return {
        capabilities,
        client: withCapabilityDowngrade(
          new AISDKStreamingClient({
            provider: settings.provider,
            model: createAnthropicModel(settings, dependencies),
            streamText: dependencies.streamText,
          }),
          settings.provider,
          capabilities,
        ),
      };
    }
    case "openai-compatible":
      return createOpenAICompatibleLLMClient(settings, dependencies, options);
  }
}

export function unsupportedCapabilityMessage(
  provider: LLMProvider,
  capability: keyof LLMProviderCapabilities,
): string {
  return `LLM provider '${provider}' does not support ${capability} for this request.`;
}

function createOpenAICompatibleLLMClient(
  settings: ModelSettings,
  dependencies: LLMClientFactoryDependencies,
  options: LLMClientFactoryOptions,
): LLMClientFactoryResult {
  const capabilities = providerCapabilities(settings);
  const clientSettings: OpenAICompatibleClientSettings = {
    model: settings.model,
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
    api: settings.api,
    networkLogger: options.networkLogger,
  };
  const createClient =
    dependencies.createOpenAICompatibleClient ??
    ((clientOptions) => new VercelClient(clientOptions));

  return {
    capabilities,
    client: withCapabilityDowngrade(
      createClient(clientSettings),
      settings.provider,
      capabilities,
    ),
  };
}

function providerCapabilities(settings: ModelSettings): LLMProviderCapabilities {
  if (settings.provider === "openai-compatible" && settings.api === "completion") {
    return {
      streaming: true,
      toolCalling: false,
      multimodal: false,
    };
  }

  return {
    streaming: true,
    toolCalling: true,
    multimodal: true,
  };
}

function createAnthropicModel(
  settings: ModelSettings,
  dependencies: LLMClientFactoryDependencies,
) {
  const createProvider = dependencies.createAnthropic ?? createAnthropic;
  const provider = createProvider({ apiKey: settings.apiKey });
  return provider(settings.model);
}

function withCapabilityDowngrade(
  client: LLMClientLike,
  provider: LLMProvider,
  capabilities: LLMProviderCapabilities,
): LLMClientLike {
  return new CapabilityAwareLLMClient(client, provider, capabilities);
}

class CapabilityAwareLLMClient implements LLMClient {
  constructor(
    private readonly client: LLMClientLike,
    private readonly provider: LLMProvider,
    private readonly capabilities: LLMProviderCapabilities,
  ) {}

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
    if (!this.capabilities.multimodal && hasImageContent(messages)) {
      throw new Error(unsupportedCapabilityMessage(this.provider, "multimodal"));
    }

    const effectiveTools = this.capabilities.toolCalling ? tools : [];
    if (this.client.stream) {
      yield* this.client.stream(messages, effectiveTools, options);
      return;
    }

    if (this.client.complete) {
      const completion = await this.client.complete(messages, effectiveTools, options);
      if (completion.message.content) {
        yield { type: "text_delta", text: completion.message.content };
      }
      for (const toolCall of completion.toolCalls ?? []) {
        yield { type: "tool_call", toolCall };
      }
      yield {
        type: "message_end",
        message: completion.message,
        toolCalls: completion.toolCalls,
      };
      return;
    }

    throw new Error("LLMClient must implement stream() or complete().");
  }
}

class AISDKStreamingClient implements LLMClient {
  private readonly provider;
  private readonly model;
  private readonly streamText;

  constructor(input: {
    provider: LLMProvider;
    model: unknown;
    streamText?: typeof streamText;
  }) {
    this.provider = input.provider;
    this.model = input.model;
    this.streamText = input.streamText ?? streamText;
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
    const reverseToolNames = new Map(
      tools.map((t) => [sanitizeToolName(t.name), t.name]),
    );
    const response = this.streamText({
      model: this.model as Parameters<typeof streamText>[0]["model"],
      messages: await toVercelMessages(messages, options),
      tools: toVercelTools(tools),
    });
    let content = "";
    const toolCalls: NonNullable<LLMCompletion["toolCalls"]> = [];

    for await (const part of response.fullStream) {
      switch (part.type) {
        case "text-delta":
          content += part.text;
          yield { type: "text_delta", text: part.text };
          break;
        case "tool-call": {
          const toolCall = {
            id: part.toolCallId,
            name: reverseToolNames.get(part.toolName) ?? part.toolName,
            arguments: part.input as Record<string, unknown>,
          };
          toolCalls.push(toolCall);
          yield { type: "tool_call", toolCall };
          break;
        }
      }
    }

    yield {
      type: "message_end",
      message: { role: "assistant", content },
      toolCalls,
    };
  }
}
