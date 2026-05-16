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
      type: "platform_bridge_hello";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { agent: string };
    }
  | {
      type: "platform_request";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        requestId: string;
        method: string;
        args: unknown;
        timeoutMs?: number;
      };
    }
  | {
      type: "platform_response";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: PlatformResponsePayload;
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

export type PlatformResponsePayload =
  | {
      requestId: string;
      status: "ok";
      result: unknown;
    }
  | {
      requestId: string;
      status: "error";
      message: string;
      code?: string;
    };
