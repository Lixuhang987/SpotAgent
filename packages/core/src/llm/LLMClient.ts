import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { ToolCallEnvelope } from "../runtime/ToolCallEnvelope.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";

export type LLMCompletion = {
  message: Extract<AgentMessage, { role: "assistant" }>;
  toolCalls?: ToolCallEnvelope[];
};

export interface LLMClient {
  complete(messages: AgentMessage[], tools: RegisteredTool[]): Promise<LLMCompletion>;
}
