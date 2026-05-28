import { statSync } from "node:fs";
import type {
  LLMClient,
  LLMClientLike,
  LLMCompleteOptions,
  LLMCompletion,
  LLMStreamEvent,
} from "@handagent/core/llm/LLMClient.ts";
import { completeLLM, streamLLM } from "@handagent/core/llm/LLMClient.ts";
import { createLLMClient } from "@handagent/core/llm/LLMClientFactory.ts";
import {
  loadModelSettings,
  modelSettingsFilePath,
} from "@handagent/core/config/ModelSettings.ts";
import type { ModelSettings } from "@handagent/core/config/ModelSettings.ts";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type { RegisteredTool } from "@handagent/core/tools/ToolRegistry.ts";
import type { NetworkLogger } from "@handagent/core/logging/NetworkLogger.ts";

type SettingsBackedLLMClientOptions = {
  networkLogger?: NetworkLogger;
  purpose?: "chat" | "summarizer";
};

type SettingsBackedLLMClientDependencies = {
  loadModelSettings?: () => ModelSettings;
  readSettingsStamp?: () => string;
  createClient?: (settings: SettingsBackedLLMClientSettings) => LLMClientLike;
};

type SettingsBackedLLMClientSettings = {
  provider: ModelSettings["provider"];
  model: string;
  apiKey?: string;
  baseURL?: string;
  api: ModelSettings["api"];
  networkLogger?: NetworkLogger;
};

export class SettingsBackedLLMClient implements LLMClient {
  private readonly loadModelSettings;
  private readonly readSettingsStamp;
  private readonly createClient;
  private readonly networkLogger;
  private readonly purpose;
  private cachedStamp?: string;
  private cachedClientSettings?: SettingsBackedLLMClientSettings;
  private cachedClient?: LLMClientLike;

  constructor(
    options: SettingsBackedLLMClientOptions = {},
    dependencies: SettingsBackedLLMClientDependencies = {},
  ) {
    this.loadModelSettings = dependencies.loadModelSettings ?? loadModelSettings;
    this.readSettingsStamp = dependencies.readSettingsStamp ?? readModelSettingsStamp;
    this.createClient =
      dependencies.createClient ??
      ((settings) =>
        createLLMClient({
          provider: settings.provider,
          model: settings.model,
          summarizerModel: settings.model,
          apiKey: settings.apiKey,
          baseUrl: settings.baseURL,
          api: settings.api,
        }, {}, { networkLogger: settings.networkLogger }).client);
    this.networkLogger = options.networkLogger;
    this.purpose = options.purpose ?? "chat";
  }

  async complete(
    messages: AgentMessage[],
    tools: RegisteredTool[],
    options?: LLMCompleteOptions,
  ): Promise<LLMCompletion> {
    const settingsStamp = this.readSettingsStamp();
    const client = this.clientForStamp(settingsStamp);
    return completeLLM(client, messages, tools, options);
  }

  stream(
    messages: AgentMessage[],
    tools: RegisteredTool[],
    options?: LLMCompleteOptions,
  ): AsyncIterable<LLMStreamEvent> {
    const settingsStamp = this.readSettingsStamp();
    const client = this.clientForStamp(settingsStamp);
    return streamLLM(client, messages, tools, options);
  }

  private clientForStamp(settingsStamp: string): LLMClientLike {
    if (this.cachedClient && this.cachedStamp === settingsStamp) {
      return this.cachedClient;
    }

    const nextClientSettings = this.toClientSettings(this.loadModelSettings());
    if (
      this.cachedClient &&
      this.cachedClientSettings &&
      sameClientSettings(this.cachedClientSettings, nextClientSettings)
    ) {
      this.cachedStamp = settingsStamp;
      return this.cachedClient;
    }

    this.cachedClient = this.createClient(nextClientSettings);
    this.cachedClientSettings = nextClientSettings;
    this.cachedStamp = settingsStamp;
    return this.cachedClient;
  }

  private toClientSettings(settings: ModelSettings): SettingsBackedLLMClientSettings {
    return {
      provider: settings.provider,
      model: this.purpose === "summarizer" ? settings.summarizerModel : settings.model,
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl,
      api: settings.api,
      networkLogger: this.networkLogger,
    };
  }
}

function readModelSettingsStamp(): string {
  try {
    const stats = statSync(modelSettingsFilePath());
    return `${stats.mtimeMs}:${stats.size}`;
  } catch (error) {
    if (isNotFoundError(error)) {
      return "missing";
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function sameClientSettings(
  previous: SettingsBackedLLMClientSettings,
  next: SettingsBackedLLMClientSettings,
): boolean {
  return (
    previous.provider === next.provider &&
    previous.model === next.model &&
    previous.apiKey === next.apiKey &&
    previous.baseURL === next.baseURL &&
    previous.api === next.api &&
    previous.networkLogger === next.networkLogger
  );
}
