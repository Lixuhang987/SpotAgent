import type { AgentMessage } from "../runtime/AgentMessage.ts";

export type ThreadMetadata = {
  id: string;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  workspaceId?: string | null;
  actionBinding?: ThreadActionBinding;
};

export type ThreadActionBinding = {
  pluginId: string;
  promptName: string;
  mcpServerIds: string[];
};

export type ThreadAuditEventType =
  | "tool_call"
  | "tool_result"
  | "permission_request"
  | "error";

export type ThreadAuditEvent =
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

export type PersistedThread = {
  version: 1;
  metadata: ThreadMetadata;
  messages: AgentMessage[];
  events: ThreadAuditEvent[];
};
