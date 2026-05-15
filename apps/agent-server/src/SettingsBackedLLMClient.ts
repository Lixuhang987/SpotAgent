import type { LLMClient, LLMCompletion } from "../../../packages/core/src/llm/LLMClient.ts";
import { VercelClient } from "../../../packages/core/src/llm/VercelClient.ts";
import { loadModelSettings } from "../../../packages/core/src/config/ModelSettings.ts";
import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type { RegisteredTool } from "../../../packages/core/src/tools/ToolRegistry.ts";

export class SettingsBackedLLMClient implements LLMClient {
  async complete(messages: AgentMessage[], tools: RegisteredTool[]): Promise<LLMCompletion> {
    const settings = loadModelSettings();
    return new VercelClient({
      model: settings.model,
      apiKey: settings.apiKey,
      baseURL: settings.baseUrl,
      api: settings.api,
    }).complete(messages, tools);
  }
}
