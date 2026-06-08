import type {
  AgentActivityEvent,
  AgentActivityStatus,
  AgentActivityWaitingRequest,
} from "@handagent/core/protocol/AgentActivity.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";

export type ActivitySourceEvent = ThreadNotification | ServerRequest;

type SendActivityEvent = (event: AgentActivityEvent) => void;

type ActivityState = {
  activeThreadId: string | null;
  status: AgentActivityStatus;
  latestSummary: string | null;
  waitingRequest: AgentActivityWaitingRequest | null;
  error: string | null;
  updatedAt: string;
};

export class AgentActivityPublisher {
  private readonly connections = new Map<string, SendActivityEvent>();
  private state: ActivityState;

  constructor(private readonly now: () => string = () => new Date().toISOString()) {
    this.state = {
      activeThreadId: null,
      status: "idle",
      latestSummary: null,
      waitingRequest: null,
      error: null,
      updatedAt: this.now(),
    };
  }

  attachConnection(connectionId: string, send: SendActivityEvent): void {
    this.connections.set(connectionId, send);
    send(this.snapshot());
  }

  detachConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  observe(event: ActivitySourceEvent): void {
    const nextState = this.deriveNextState(event);
    if (nextState === null) {
      return;
    }

    this.state = nextState;
    this.broadcast({
      channel: "activity",
      type: "activity.changed",
      ...this.state,
    });
  }

  snapshot(): AgentActivityEvent {
    return {
      channel: "activity",
      type: "activity.snapshot",
      ...this.state,
    };
  }

  private deriveNextState(event: ActivitySourceEvent): ActivityState | null {
    switch (event.type) {
      case "thread.started":
        return this.nextState(event.threadId, "starting", summarize(event.payload.preview) ?? "正在开始");
      case "user.message.recorded":
        return this.nextState(event.threadId, "starting", summarize(event.payload.text));
      case "turn.started":
      case "assistant.delta":
        return this.nextState(event.threadId, "running", "正在回复");
      case "tool.started":
        return this.nextState(event.threadId, "tool_running", `正在使用 ${event.payload.name}`);
      case "permission.requested":
        return this.nextState(event.threadId, "waiting", "等待权限确认", "permission");
      case "workspace.requested":
        return this.nextState(event.threadId, "waiting", "等待工作区选择", "workspace");
      case "turn.completed":
        if (event.payload.status === "failed") {
          return this.nextState(event.threadId, "error", "运行失败", null, "运行失败");
        }
        if (event.payload.status === "interrupted") {
          return this.nextState(event.threadId, "completed", "已中断");
        }
        return this.nextState(event.threadId, "completed", "已完成");
      case "thread.status.changed":
        if (event.payload.value === "idle") {
          return this.nextState(event.threadId, "idle", "点击开始");
        }
        if (event.payload.value === "failed") {
          return this.nextState(event.threadId, "error", "运行失败", null, "运行失败");
        }
        if (event.payload.value === "interrupted") {
          return this.nextState(event.threadId, "error", "已中断", null, "已中断");
        }
        return null;
      case "thread.error": {
        const message = summarize(event.payload.message) ?? "运行失败";
        return this.nextState(event.threadId ?? this.state.activeThreadId, "error", message, null, message);
      }
      case "tool.finished":
      case "thread.snapshot":
      case "thread.listed":
      case "thread.deleted":
      case "workspace.listed":
        return null;
    }
  }

  private nextState(
    activeThreadId: string | null,
    status: AgentActivityStatus,
    latestSummary: string | null,
    waitingRequest: AgentActivityWaitingRequest | null = null,
    error: string | null = null,
  ): ActivityState {
    return {
      activeThreadId,
      status,
      latestSummary,
      waitingRequest,
      error,
      updatedAt: this.now(),
    };
  }

  private broadcast(event: AgentActivityEvent): void {
    for (const send of this.connections.values()) {
      send(event);
    }
  }
}

function summarize(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= 80) {
    return trimmed;
  }
  return `${trimmed.slice(0, 77)}...`;
}
