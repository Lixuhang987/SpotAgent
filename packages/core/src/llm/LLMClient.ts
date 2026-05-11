import type { AgentMessage } from "../runtime/AgentMessage";
import type { ToolCallEnvelope } from "../runtime/ToolCallEnvelope";
import type { RegisteredTool } from "../tools/ToolRegistry";

export type LLMCompletion = {
  message: Extract<AgentMessage, { role: "assistant" }>;
  toolCalls?: ToolCallEnvelope[];
};

export interface LLMClient {
  complete(messages: AgentMessage[], tools: RegisteredTool[]): Promise<LLMCompletion>;
}
