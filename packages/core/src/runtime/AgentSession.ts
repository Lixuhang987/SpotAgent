import type { BlobStore } from "../blob/BlobStore.ts";
import type { PermissionPolicy } from "../permission/PermissionPolicy.ts";
import type { LLMClientLike } from "../llm/LLMClient.ts";
import type { ToolRegistry } from "../tools/ToolRegistry.ts";
import type { TurnSummarizerLike } from "./TurnSummarizer.ts";
import type { ActionBindingPayload } from "../protocol/ThreadProtocolShared.ts";

export type AgentRunConfig = {
  model: string;
  provider: string;
  workspaceId: string | null;
  actionBinding: ActionBindingPayload | null;
  maxTimes: number;
};

export type AgentServices = {
  llmClient: LLMClientLike;
  toolRegistry: ToolRegistry;
  permissionPolicy: PermissionPolicy;
  blobStore: BlobStore;
  turnSummarizer: TurnSummarizerLike | null;
};

export type AgentSession = {
  threadId: string;
  config: AgentRunConfig;
  services: AgentServices;
};
