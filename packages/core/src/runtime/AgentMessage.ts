import type { ToolCallEnvelope } from "./ToolCallEnvelope.ts";

export type AgentMessage =
  | {
      role: "user";
      content: string;
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
