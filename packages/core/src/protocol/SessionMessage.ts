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
      payload: { text: string; selection?: string | null };
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
    };
