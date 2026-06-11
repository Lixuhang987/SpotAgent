import type { ToolCallEnvelope } from "./ToolCallEnvelope.ts";

export type AgentTextContentPart = {
  type: "text";
  text: string;
};

export type AgentImageContentPart = {
  type: "image";
  blobId: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
};

export type AgentUserContent = string | Array<AgentTextContentPart | AgentImageContentPart>;

export type UserAgentMessage = {
  role: "user";
  content: AgentUserContent;
};

export type AssistantAgentMessage = {
  role: "assistant";
  content: string;
  toolCalls?: ToolCallEnvelope[];
};

export type ToolAgentMessage = {
  role: "tool";
  toolCallId: string;
  name: string;
  content: string;
  blob?: { id: string; cached: "turn" | "persist"; summarized?: boolean };
};

export type SystemAgentMessage = {
  role: "system";
  content: string;
};

export type AgentMessage =
  | UserAgentMessage
  | AssistantAgentMessage
  | ToolAgentMessage
  | SystemAgentMessage;
