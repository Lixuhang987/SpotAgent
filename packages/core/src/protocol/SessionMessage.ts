import type {
  ConversationMessage,
  ToolMessageStatus,
} from "../conversation/ConversationMessage.ts";
import type {
  RunStatus,
  SessionListEntry,
  UserMessageAttachment,
  WorkspaceAskCandidate,
} from "./SessionProtocolShared.ts";

export type SessionMessage =
  | {
      type: "create_session_request";
      sessionId: "";
      messageId: string;
      timestamp: string;
      payload: {
        initialText?: string;
        attachments?: UserMessageAttachment[];
        workspaceId?: string | null;
        actionBinding?: {
          pluginId: string;
          promptName: string;
        };
      };
    }
  | {
      type: "create_session_response";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        title: string | null;
      };
    }
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
      payload: { status: "completed" | "interrupted" };
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
      payload: { value: RunStatus };
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
        status: RunStatus;
      };
    }
  | {
      type: "session_open_failed";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        reason: "not_found" | "unavailable";
        message: string;
      };
    }
  | {
      type: "user_message_failed";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        reason: "session_not_found" | "invalid_request";
        message: string;
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
    }
  | {
      type: "delete_session_response";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        targetSessionId: string;
        status: "deleted" | "not_found";
      };
    };
