import type { LLMClient, LLMCompletion } from "../../../packages/core/src/llm/LLMClient.ts";
import { VercelClient } from "../../../packages/core/src/llm/VercelClient.ts";
import { loadModelSettings } from "../../../packages/core/src/config/ModelSettings.ts";
import type { ModelSettings } from "../../../packages/core/src/config/ModelSettings.ts";
import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type { RegisteredTool } from "../../../packages/core/src/tools/ToolRegistry.ts";
import type { NetworkLogger } from "../../../packages/core/src/logging/NetworkLogger.ts";

type SettingsBackedLLMClientOptions = {
  networkLogger?: NetworkLogger;
};

type SettingsBackedLLMClientDependencies = {
  loadModelSettings?: () => ModelSettings;
  createClient?: (settings: {
    model: string;
    apiKey?: string;
    baseURL?: string;
    api: ModelSettings["api"];
    networkLogger?: NetworkLogger;
  }) => Pick<LLMClient, "complete">;
};

export class SettingsBackedLLMClient implements LLMClient {
  private readonly loadModelSettings;
  private readonly createClient;
  private readonly networkLogger;

  constructor(
    options: SettingsBackedLLMClientOptions = {},
    dependencies: SettingsBackedLLMClientDependencies = {},
  ) {
    this.loadModelSettings = dependencies.loadModelSettings ?? loadModelSettings;
    this.createClient =
      dependencies.createClient ??
      ((settings) => new VercelClient(settings));
    this.networkLogger = options.networkLogger;
  }

  async complete(messages: AgentMessage[], tools: RegisteredTool[]): Promise<LLMCompletion> {
    const settings = this.loadModelSettings();
    return this.createClient({
      model: settings.model,
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl,
      api: settings.api,
      networkLogger: this.networkLogger,
    }).complete(messages, tools);
  }
}
