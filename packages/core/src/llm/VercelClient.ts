import type { AgentMessage } from "../runtime/AgentMessage";
import type { LLMClient, LLMCompletion } from "./LLMClient";
import type { RegisteredTool } from "../tools/ToolRegistry";

export type VercelClientOptions = {
  model?: string;
  responseText?: string;
};

export class VercelClient implements LLMClient {
  constructor(private readonly options: VercelClientOptions = {}) {}

  async complete(messages: AgentMessage[], tools: RegisteredTool[]): Promise<LLMCompletion> {
    void messages;
    void tools;

    return {
      message: {
        role: "assistant",
        content: this.options.responseText ?? "done",
      },
      toolCalls: [],
    };
  }
}
