import type {
  AgentActivityEvent,
  AgentActivityStatus,
  AgentActivityWaitingRequest,
} from "@handagent/core/protocol/AgentActivity.ts";

export type ActivityState = {
  activeThreadId: string | null;
  status: AgentActivityStatus;
  latestSummary: string | null;
  waitingRequest: AgentActivityWaitingRequest | null;
  error: string | null;
  updatedAt: string | null;
};

export type ActivityDisplay = {
  label: string;
  detail: string;
  tone: "idle" | "running" | "tool" | "waiting" | "done" | "error";
};

export const initialActivityState: ActivityState = {
  activeThreadId: null,
  status: "idle",
  latestSummary: null,
  waitingRequest: null,
  error: null,
  updatedAt: null,
};

export function reduceActivityEvent(
  _state: ActivityState,
  event: AgentActivityEvent,
): ActivityState {
  return {
    activeThreadId: event.activeThreadId,
    status: event.status,
    latestSummary: event.latestSummary,
    waitingRequest: event.waitingRequest,
    error: event.error,
    updatedAt: event.updatedAt,
  };
}

export function activityDisplay(state: ActivityState): ActivityDisplay {
  switch (state.status) {
    case "starting":
      return {
        label: "正在开始",
        detail: state.latestSummary ?? "准备对话",
        tone: "running",
      };
    case "running":
      return {
        label: "正在回复",
        detail: state.latestSummary ?? "Agent 正在处理",
        tone: "running",
      };
    case "tool_running":
      return {
        label: "工具运行中",
        detail: state.latestSummary ?? "正在调用工具",
        tone: "tool",
      };
    case "waiting":
      return {
        label: "等待确认",
        detail: state.latestSummary ?? "需要用户确认",
        tone: "waiting",
      };
    case "completed":
      return {
        label: "已完成",
        detail: state.latestSummary ?? "最近一轮已完成",
        tone: "done",
      };
    case "error":
      return {
        label: "出现错误",
        detail: state.error ?? state.latestSummary ?? "运行失败",
        tone: "error",
      };
    case "idle":
      return {
        label: "点击开始",
        detail: state.latestSummary ?? "HandAgent 空闲",
        tone: "idle",
      };
  }
}
