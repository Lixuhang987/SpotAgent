import type {
  RunStatus,
  ThreadListEntry,
  ThreadSnapshotPayload,
} from "./ThreadProtocolShared.ts";

export type ThreadStartedNotification = {
  type: "thread.started";
  threadId: string;
  notificationId: string;
  commandId?: string;
  timestamp: string;
  payload: {
    preview: string | null;
  };
};

export type ThreadSnapshotNotification = {
  type: "thread.snapshot";
  threadId: string;
  notificationId: string;
  commandId?: string;
  timestamp: string;
  payload: ThreadSnapshotPayload;
};

export type UserMessageRecordedNotification = {
  type: "user.message.recorded";
  threadId: string;
  notificationId: string;
  timestamp: string;
  payload: {
    messageId: string;
    text: string;
  };
};

export type TurnStartedNotification = {
  type: "turn.started";
  threadId: string;
  notificationId: string;
  turnId: string;
  timestamp: string;
  payload: {};
};

export type AssistantDeltaNotification = {
  type: "assistant.delta";
  threadId: string;
  notificationId: string;
  turnId: string;
  itemId: string;
  timestamp: string;
  payload: {
    text: string;
  };
};

export type ToolStartedNotification = {
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
};

export type ToolFinishedNotification = {
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
};

export type TurnCompletedNotification = {
  type: "turn.completed";
  threadId: string;
  notificationId: string;
  turnId: string;
  timestamp: string;
  payload: {
    status: "completed" | "interrupted" | "failed";
  };
};

export type ThreadStatusChangedNotification = {
  type: "thread.status.changed";
  threadId: string;
  notificationId: string;
  timestamp: string;
  payload: {
    value: RunStatus;
  };
};

export type ThreadListedNotification = {
  type: "thread.listed";
  notificationId: string;
  commandId?: string;
  timestamp: string;
  payload: {
    threads: ThreadListEntry[];
  };
};

export type ThreadDeletedNotification = {
  type: "thread.deleted";
  notificationId: string;
  commandId?: string;
  timestamp: string;
  payload: {
    targetThreadId: string;
    status: "deleted" | "not_found";
  };
};

export type ThreadErrorNotification = {
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

export type WorkspaceListedNotification = {
  type: "workspace.listed";
  notificationId: string;
  commandId?: string;
  timestamp: string;
  payload: {
    workspaces: Array<{
      id: string;
      name: string;
      rootPath: string;
    }>;
  };
};

export type ThreadNotification =
  | ThreadStartedNotification
  | ThreadSnapshotNotification
  | UserMessageRecordedNotification
  | TurnStartedNotification
  | AssistantDeltaNotification
  | ToolStartedNotification
  | ToolFinishedNotification
  | TurnCompletedNotification
  | ThreadStatusChangedNotification
  | ThreadListedNotification
  | ThreadDeletedNotification
  | ThreadErrorNotification
  | WorkspaceListedNotification;
