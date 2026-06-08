import { describe, expect, it } from "vitest";

import {
  activityDisplay,
  initialActivityState,
  reduceActivityEvent,
} from "../../src/activity-window/activityState.ts";

describe("activityState", () => {
  it("starts from an idle snapshot state", () => {
    expect(initialActivityState).toEqual({
      activeThreadId: null,
      status: "idle",
      latestSummary: null,
      waitingRequest: null,
      error: null,
      updatedAt: null,
    });
  });

  it("reduces changed events into the latest activity state", () => {
    const state = reduceActivityEvent(initialActivityState, {
      channel: "activity",
      type: "activity.changed",
      activeThreadId: "thread-1",
      status: "tool_running",
      latestSummary: "正在使用 file.read",
      waitingRequest: null,
      error: null,
      updatedAt: "2026-06-08T00:00:01.000Z",
    });

    expect(state).toEqual({
      activeThreadId: "thread-1",
      status: "tool_running",
      latestSummary: "正在使用 file.read",
      waitingRequest: null,
      error: null,
      updatedAt: "2026-06-08T00:00:01.000Z",
    });
  });

  it("displays tool running activity with a tool tone", () => {
    const display = activityDisplay({
      activeThreadId: "thread-1",
      status: "tool_running",
      latestSummary: "正在使用 file.read",
      waitingRequest: null,
      error: null,
      updatedAt: "2026-06-08T00:00:01.000Z",
    });

    expect(display).toEqual({
      label: "工具运行中",
      detail: "正在使用 file.read",
      tone: "tool",
    });
  });
});
