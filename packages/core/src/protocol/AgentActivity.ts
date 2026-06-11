export type AgentActivityStatus =
  | "idle"
  | "starting"
  | "running"
  | "tool_running"
  | "waiting"
  | "completed"
  | "error";

export type AgentActivityWaitingRequest = "permission" | "workspace";

export type ActivitySnapshotEvent = {
  channel: "activity";
  type: "activity.snapshot";
  activeThreadId: string | null;
  status: AgentActivityStatus;
  latestSummary: string | null;
  waitingRequest: AgentActivityWaitingRequest | null;
  error: string | null;
  updatedAt: string;
};

export type ActivityChangedEvent = {
  channel: "activity";
  type: "activity.changed";
  activeThreadId: string | null;
  status: AgentActivityStatus;
  latestSummary: string | null;
  waitingRequest: AgentActivityWaitingRequest | null;
  error: string | null;
  updatedAt: string;
};

export type AgentActivityEvent =
  | ActivitySnapshotEvent
  | ActivityChangedEvent;
