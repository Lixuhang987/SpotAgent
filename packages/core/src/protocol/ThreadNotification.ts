import type {
  RunStatus,
  ThreadListEntry,
  ThreadSnapshotPayload,
} from "./ThreadProtocolShared.ts";

export type ThreadNotification =
  | {
      type: "thread.started";
      threadId: string;
      notificationId: string;
      commandId?: string;
      timestamp: string;
      payload: {
        preview: string | null;
      };
    }
  | {
      type: "thread.snapshot";
      threadId: string;
      notificationId: string;
      commandId?: string;
      timestamp: string;
      payload: ThreadSnapshotPayload;
    }
  | {
      type: "user.message.recorded";
      threadId: string;
      notificationId: string;
      timestamp: string;
      payload: {
        messageId: string;
        text: string;
      };
    }
  | {
      type: "turn.started";
      threadId: string;
      notificationId: string;
      turnId: string;
      timestamp: string;
      payload: {};
    }
  | {
      type: "assistant.delta";
      threadId: string;
      notificationId: string;
      turnId: string;
      itemId: string;
      timestamp: string;
      payload: {
        text: string;
      };
    }
  | {
      type: "tool.started";
      threadId: string;
      notificationId: string;
      turnId: string;
      itemId: string;
      timestamp: string;
      payload: {
        name: string;
        input: Record<string, unknown>;
      };
    }
  | {
      type: "tool.finished";
      threadId: string;
      notificationId: string;
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
      type: "turn.completed";
      threadId: string;
      notificationId: string;
      turnId: string;
      timestamp: string;
      payload: {
        status: "completed" | "interrupted" | "failed";
      };
    }
  | {
      type: "thread.status.changed";
      threadId: string;
      notificationId: string;
      timestamp: string;
      payload: {
        value: RunStatus;
      };
    }
  | {
      type: "thread.listed";
      notificationId: string;
      commandId?: string;
      timestamp: string;
      payload: {
        threads: ThreadListEntry[];
      };
    }
  | {
      type: "thread.deleted";
      notificationId: string;
      commandId?: string;
      timestamp: string;
      payload: {
        targetThreadId: string;
        status: "deleted" | "not_found";
      };
    }
  | {
      type: "thread.error";
      threadId?: string;
      notificationId: string;
      commandId?: string;
      timestamp: string;
      payload: {
        code?: string;
        message: string;
      };
    };
