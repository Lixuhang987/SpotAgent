import type { AgentMessage } from "../runtime/AgentMessage.ts";

export type SessionMetadata = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type SessionEventType =
  | "tool_call"
  | "tool_result"
  | "permission_request"
  | "error";

export type SessionEvent =
  | {
      type: "tool_call";
      timestamp: string;
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      timestamp: string;
      toolCallId: string;
      status: "success" | "error";
      output?: string;
      durationMs?: number;
    }
  | {
      type: "permission_request";
      timestamp: string;
      toolName: string;
      action: string;
      granted: boolean;
    }
  | {
      type: "error";
      timestamp: string;
      message: string;
      code?: string;
    };

export type PersistedSession = {
  version: 1;
  metadata: SessionMetadata;
  messages: AgentMessage[];
  events: SessionEvent[];
};
