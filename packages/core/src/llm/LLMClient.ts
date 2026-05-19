import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { ToolCallEnvelope } from "../runtime/ToolCallEnvelope.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";
import type { BlobStore } from "../blob/BlobStore.ts";

export type LLMCompletion = {
  message: Extract<AgentMessage, { role: "assistant" }>;
  toolCalls?: ToolCallEnvelope[];
};

export type LLMCompleteOptions = {
  blobStore?: BlobStore;
};

export interface LLMClient {
  complete(
    messages: AgentMessage[],
    tools: RegisteredTool[],
    options?: LLMCompleteOptions,
  ): Promise<LLMCompletion>;
}
