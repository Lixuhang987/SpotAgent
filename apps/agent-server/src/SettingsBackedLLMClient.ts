import { statSync } from "node:fs";
import type { LLMClient, LLMCompletion } from "../../../packages/core/src/llm/LLMClient.ts";
import { VercelClient } from "../../../packages/core/src/llm/VercelClient.ts";
import {
  loadModelSettings,
  modelSettingsFilePath,
} from "../../../packages/core/src/config/ModelSettings.ts";
import type { ModelSettings } from "../../../packages/core/src/config/ModelSettings.ts";
import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type { RegisteredTool } from "../../../packages/core/src/tools/ToolRegistry.ts";
import type { NetworkLogger } from "../../../packages/core/src/logging/NetworkLogger.ts";

type SettingsBackedLLMClientOptions = {
  networkLogger?: NetworkLogger;
  purpose?: "chat" | "summarizer";
};

type SettingsBackedLLMClientDependencies = {
  loadModelSettings?: () => ModelSettings;
  readSettingsStamp?: () => string;
  createClient?: (settings: VercelClientSettings) => Pick<LLMClient, "complete">;
};

type VercelClientSettings = {
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
  private cachedClientSettings?: VercelClientSettings;
  private cachedClient?: Pick<LLMClient, "complete">;

  constructor(
    options: SettingsBackedLLMClientOptions = {},
    dependencies: SettingsBackedLLMClientDependencies = {},
  ) {
    this.loadModelSettings = dependencies.loadModelSettings ?? loadModelSettings;
    this.readSettingsStamp = dependencies.readSettingsStamp ?? readModelSettingsStamp;
    this.createClient =
      dependencies.createClient ??
      ((settings) => new VercelClient(settings));
    this.networkLogger = options.networkLogger;
    this.purpose = options.purpose ?? "chat";
  }

  async complete(messages: AgentMessage[], tools: RegisteredTool[]): Promise<LLMCompletion> {
    const settingsStamp = this.readSettingsStamp();
    const client = this.clientForStamp(settingsStamp);
    return client.complete(messages, tools);
  }

  private clientForStamp(settingsStamp: string): Pick<LLMClient, "complete"> {
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

  private toClientSettings(settings: ModelSettings): VercelClientSettings {
    return {
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
  previous: VercelClientSettings,
  next: VercelClientSettings,
): boolean {
  return (
    previous.model === next.model &&
    previous.apiKey === next.apiKey &&
    previous.baseURL === next.baseURL &&
    previous.api === next.api &&
    previous.networkLogger === next.networkLogger
  );
}
