import type { LLMClient, LLMCompletion } from "../../../packages/core/src/llm/LLMClient.ts";
import { VercelClient } from "../../../packages/core/src/llm/VercelClient.ts";
import { loadModelSettings } from "../../../packages/core/src/config/ModelSettings.ts";
import type { ModelSettings } from "../../../packages/core/src/config/ModelSettings.ts";
import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type { RegisteredTool } from "../../../packages/core/src/tools/ToolRegistry.ts";

type SettingsBackedLLMClientDependencies = {
  loadModelSettings?: () => ModelSettings;
  createClient?: (settings: {
    model: string;
    apiKey?: string;
    baseURL?: string;
    api: ModelSettings["api"];
  }) => Pick<LLMClient, "complete">;
};

export class SettingsBackedLLMClient implements LLMClient {
  private readonly loadModelSettings;
  private readonly createClient;

  constructor(dependencies: SettingsBackedLLMClientDependencies = {}) {
    this.loadModelSettings = dependencies.loadModelSettings ?? loadModelSettings;
    this.createClient =
      dependencies.createClient ??
      ((settings) => new VercelClient(settings));
  }

  async complete(messages: AgentMessage[], tools: RegisteredTool[]): Promise<LLMCompletion> {
    const settings = this.loadModelSettings();
    return this.createClient({
      model: settings.model,
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl,
      api: settings.api,
    }).complete(messages, tools);
  }
}
