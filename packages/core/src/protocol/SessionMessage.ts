import type {
  ConversationMessage,
  ToolMessageStatus,
} from "../conversation/ConversationMessage.ts";

export type SessionMessage =
  | {
      type: "open_session";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { workspaceRoot?: string };
    }
  | {
      type: "user_message";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { text: string; attachments?: UserMessageAttachment[] };
    }
  | {
      type: "interrupt";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {};
    }
  | {
      type: "assistant_message_start";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { role: "assistant" };
    }
  | {
      type: "assistant_message_delta";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { text: string };
    }
  | {
      type: "assistant_message_end";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { status: "completed" };
    }
  | {
      type: "tool_message";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        name: string;
        text: string;
        status: ToolMessageStatus;
      };
    }
  | {
      type: "status";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { value: "idle" | "running" | "failed" };
    }
  | {
      type: "error";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { message: string };
    }
  | {
      type: "session_snapshot";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        messages: ConversationMessage[];
        status: "idle" | "running" | "failed";
      };
    }
  | {
      type: "permission_request";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        requestId: string;
        toolName: string;
        toolCallId: string;
        arguments: Record<string, unknown>;
        timeoutMs?: number;
      };
    }
  | {
      type: "permission_response";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        requestId: string;
        decision: "allow" | "deny";
        scope?: "once" | "session" | "always";
        reason?: string;
      };
    }
  | {
      type: "workspace_ask_request";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        requestId: string;
        toolCallId?: string;
        prompt: string;
        candidates: WorkspaceAskCandidate[];
        timeoutMs?: number;
      };
    }
  | {
      type: "workspace_ask_response";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        requestId: string;
        workspaceId?: string;
        cancelled?: boolean;
      };
    }
  | {
      type: "list_sessions_request";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {};
    }
  | {
      type: "list_sessions_response";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        sessions: SessionListEntry[];
      };
    }
  | {
      type: "load_session_request";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { targetSessionId: string };
    }
  | {
      type: "load_session_response";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        targetSessionId: string;
        messages: ConversationMessage[];
        title: string | null;
      };
    }
  | {
      type: "delete_session_request";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { targetSessionId: string };
    };

export type SessionListEntry = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type WorkspaceAskCandidate = {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
};

export type UserMessageAttachment =
  | {
      kind: "text_selection";
      id: string;
      text: string;
    }
  | {
      kind: "image";
      id: string;
      mimeType: "image/png" | "image/jpeg" | "image/webp";
      base64: string;
    };
