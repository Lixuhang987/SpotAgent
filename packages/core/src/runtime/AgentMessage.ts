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
    }
  | {
      role: "system";
      content: string;
    };
