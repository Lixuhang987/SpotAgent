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

export type AgentMessage =
  | {
      role: "user";
      content: AgentUserContent;
    }
  | {
      role: "assistant";
      content: string;
      toolCalls?: ToolCallEnvelope[];
    }
  | {
      role: "tool";
      toolCallId: string;
      name: string;
      content: string;
      blob?: { id: string; cached: "turn" | "persist"; summarized?: boolean };
    }
  | {
      role: "system";
      content: string;
    };
