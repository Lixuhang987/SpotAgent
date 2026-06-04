import type {
  ActionBindingPayload,
  UserMessageAttachment,
} from "./SessionProtocolShared.ts";

export type SessionCommand =
  | {
      type: "session_create";
      commandId: string;
      timestamp: string;
      payload: {
        initialText?: string;
        attachments?: UserMessageAttachment[];
        workspaceId?: string | null;
        actionBinding?: ActionBindingPayload;
      };
    }
  | {
      type: "session_subscribe";
      sessionId: string;
      commandId: string;
      timestamp: string;
      payload: {};
    }
  | {
      type: "session_unsubscribe";
      sessionId: string;
      commandId: string;
      timestamp: string;
      payload: {};
    }
  | {
      type: "turn_start";
      sessionId: string;
      commandId: string;
      timestamp: string;
      payload: {
        text: string;
        attachments?: UserMessageAttachment[];
      };
    }
  | {
      type: "turn_interrupt";
      sessionId: string;
      commandId: string;
      timestamp: string;
      payload: {};
    }
  | {
      type: "sessions_list";
      commandId: string;
      timestamp: string;
      payload: {};
    }
  | {
      type: "session_delete";
      commandId: string;
      timestamp: string;
      payload: {
        targetSessionId: string;
      };
    };
