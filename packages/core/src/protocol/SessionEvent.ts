import type {
  RunStatus,
  SessionListEntry,
  SessionSnapshotPayload,
} from "./SessionProtocolShared.ts";

export type SessionEvent =
  | {
      type: "session_created";
      sessionId: string;
      eventId: string;
      commandId?: string;
      timestamp: string;
      payload: {
        title: string | null;
      };
    }
  | {
      type: "session_snapshot";
      sessionId: string;
      eventId: string;
      commandId?: string;
      timestamp: string;
      payload: SessionSnapshotPayload;
    }
  | {
      type: "user_message_recorded";
      sessionId: string;
      eventId: string;
      timestamp: string;
      payload: {
        messageId: string;
        text: string;
      };
    }
  | {
      type: "turn_started";
      sessionId: string;
      eventId: string;
      turnId: string;
      timestamp: string;
      payload: {};
    }
  | {
      type: "assistant_delta";
      sessionId: string;
      eventId: string;
      turnId: string;
      itemId: string;
      timestamp: string;
      payload: {
        text: string;
      };
    }
  | {
      type: "tool_started";
      sessionId: string;
      eventId: string;
      turnId: string;
      itemId: string;
      timestamp: string;
      payload: {
        name: string;
        input: Record<string, unknown>;
      };
    }
  | {
      type: "tool_finished";
      sessionId: string;
      eventId: string;
      turnId: string;
      itemId: string;
      timestamp: string;
      payload: {
        name: string;
        status: "completed" | "failed";
        output: string;
        durationMs: number;
      };
    }
  | {
      type: "turn_completed";
      sessionId: string;
      eventId: string;
      turnId: string;
      timestamp: string;
      payload: {
        status: "completed" | "interrupted" | "failed";
      };
    }
  | {
      type: "session_status_changed";
      sessionId: string;
      eventId: string;
      timestamp: string;
      payload: {
        value: RunStatus;
      };
    }
  | {
      type: "sessions_listed";
      eventId: string;
      commandId?: string;
      timestamp: string;
      payload: {
        sessions: SessionListEntry[];
      };
    }
  | {
      type: "session_deleted";
      eventId: string;
      commandId?: string;
      timestamp: string;
      payload: {
        targetSessionId: string;
        status: "deleted" | "not_found";
      };
    }
  | {
      type: "session_error";
      sessionId?: string;
      eventId: string;
      commandId?: string;
      timestamp: string;
      payload: {
        code?: string;
        message: string;
      };
    };
