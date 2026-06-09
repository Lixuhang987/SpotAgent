import { describe, expect, it } from "vitest";
import type { AgentActivityEvent } from "@handagent/core/protocol/AgentActivity.ts";
import { AgentActivityPublisher } from "../../src/activity/AgentActivityPublisher.ts";

describe("AgentActivityPublisher", () => {
  it("sends an idle snapshot when a subscriber attaches", () => {
    const events: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");

    publisher.attachConnection("activity-1", (event) => events.push(event));

    expect(events).toEqual([
      {
        channel: "activity",
        type: "activity.snapshot",
        activeThreadId: null,
        status: "idle",
        latestSummary: null,
        waitingRequest: null,
        error: null,
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
    ]);
  });

  it("derives running, tool, completed, and error states from thread notifications", () => {
    const events: AgentActivityEvent[] = [];
    let now = "2026-06-08T00:00:00.000Z";
    const publisher = new AgentActivityPublisher(() => now);
    publisher.attachConnection("activity-1", (event) => events.push(event));

    now = "2026-06-08T00:00:01.000Z";
    publisher.observe({
      type: "user.message.recorded",
      threadId: "thread-1",
      notificationId: "n-user",
      timestamp: now,
      payload: {
        messageId: "user-1",
        text: "请总结这个项目的 Electron 状态",
      },
    });
    now = "2026-06-08T00:00:02.000Z";
    publisher.observe({
      type: "turn.started",
      threadId: "thread-1",
      notificationId: "n-turn",
      turnId: "turn-1",
      timestamp: now,
      payload: {},
    });
    now = "2026-06-08T00:00:03.000Z";
    publisher.observe({
      type: "tool.started",
      threadId: "thread-1",
      notificationId: "n-tool",
      turnId: "turn-1",
      itemId: "tool-1",
      timestamp: now,
      payload: { name: "file.read", input: { path: "handAgent.md" } },
    });
    now = "2026-06-08T00:00:04.000Z";
    publisher.observe({
      type: "turn.completed",
      threadId: "thread-1",
      notificationId: "n-done",
      turnId: "turn-1",
      timestamp: now,
      payload: { status: "completed" },
    });
    now = "2026-06-08T00:00:05.000Z";
    publisher.observe({
      type: "thread.error",
      threadId: "thread-1",
      notificationId: "n-error",
      timestamp: now,
      payload: { message: "provider failed" },
    });

    expect(events.slice(1).map((event) => ({
      type: event.type,
      status: event.status,
      activeThreadId: event.activeThreadId,
      latestSummary: event.latestSummary,
      waitingRequest: event.waitingRequest,
      error: event.error,
    }))).toEqual([
      {
        type: "activity.changed",
        status: "starting",
        activeThreadId: "thread-1",
        latestSummary: "请总结这个项目的 Electron 状态",
        waitingRequest: null,
        error: null,
      },
      {
        type: "activity.changed",
        status: "running",
        activeThreadId: "thread-1",
        latestSummary: "正在回复",
        waitingRequest: null,
        error: null,
      },
      {
        type: "activity.changed",
        status: "tool_running",
        activeThreadId: "thread-1",
        latestSummary: "正在使用 file.read",
        waitingRequest: null,
        error: null,
      },
      {
        type: "activity.changed",
        status: "completed",
        activeThreadId: "thread-1",
        latestSummary: "已完成",
        waitingRequest: null,
        error: null,
      },
      {
        type: "activity.changed",
        status: "error",
        activeThreadId: "thread-1",
        latestSummary: "provider failed",
        waitingRequest: null,
        error: "provider failed",
      },
    ]);
  });

  it("does not broadcast unsupported thread status changes or thread snapshots", () => {
    const events: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("activity-1", (event) => events.push(event));

    publisher.observe({
      type: "thread.status.changed",
      threadId: "thread-1",
      notificationId: "n-status",
      timestamp: "2026-06-08T00:00:01.000Z",
      payload: { value: "running" },
    });
    publisher.observe({
      type: "thread.snapshot",
      threadId: "thread-1",
      notificationId: "n-snapshot",
      timestamp: "2026-06-08T00:00:02.000Z",
      payload: {
        threadId: "thread-1",
        status: "running",
        messages: [],
        events: [],
      },
    });

    expect(events).toEqual([
      {
        channel: "activity",
        type: "activity.snapshot",
        activeThreadId: null,
        status: "idle",
        latestSummary: null,
        waitingRequest: null,
        error: null,
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
    ]);
  });

  it("uses thread start preview and falls back when the preview is empty", () => {
    const events: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("activity-1", (event) => events.push(event));

    publisher.observe({
      type: "thread.started",
      threadId: "thread-1",
      notificationId: "n-start-preview",
      timestamp: "2026-06-08T00:00:01.000Z",
      payload: { preview: "  准备分析项目  " },
    });
    publisher.observe({
      type: "thread.started",
      threadId: "thread-2",
      notificationId: "n-start-empty",
      timestamp: "2026-06-08T00:00:02.000Z",
      payload: { preview: "   " },
    });
    publisher.observe({
      type: "thread.started",
      threadId: "thread-3",
      notificationId: "n-start-missing",
      timestamp: "2026-06-08T00:00:03.000Z",
      payload: {},
    });

    expect(events.slice(1).map((event) => ({
      activeThreadId: event.activeThreadId,
      status: event.status,
      latestSummary: event.latestSummary,
    }))).toEqual([
      {
        activeThreadId: "thread-1",
        status: "starting",
        latestSummary: "准备分析项目",
      },
      {
        activeThreadId: "thread-2",
        status: "starting",
        latestSummary: "正在开始",
      },
      {
        activeThreadId: "thread-3",
        status: "starting",
        latestSummary: "正在开始",
      },
    ]);
  });

  it("derives failed and interrupted turn completions", () => {
    const events: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("activity-1", (event) => events.push(event));

    publisher.observe({
      type: "turn.completed",
      threadId: "thread-1",
      notificationId: "n-failed",
      turnId: "turn-1",
      timestamp: "2026-06-08T00:00:01.000Z",
      payload: { status: "failed" },
    });
    publisher.observe({
      type: "turn.completed",
      threadId: "thread-2",
      notificationId: "n-interrupted",
      turnId: "turn-2",
      timestamp: "2026-06-08T00:00:02.000Z",
      payload: { status: "interrupted" },
    });

    expect(events.slice(1).map((event) => ({
      activeThreadId: event.activeThreadId,
      status: event.status,
      latestSummary: event.latestSummary,
      error: event.error,
    }))).toEqual([
      {
        activeThreadId: "thread-1",
        status: "error",
        latestSummary: "运行失败",
        error: "运行失败",
      },
      {
        activeThreadId: "thread-2",
        status: "completed",
        latestSummary: "已中断",
        error: null,
      },
    ]);
  });

  it("keeps a full interrupted sequence completed instead of overwriting it with error", () => {
    const events: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("activity-1", (event) => events.push(event));

    publisher.observe({
      type: "turn.completed",
      threadId: "thread-1",
      notificationId: "n-turn-interrupted",
      turnId: "turn-1",
      timestamp: "2026-06-08T00:00:01.000Z",
      payload: { status: "interrupted" },
    });
    publisher.observe({
      type: "thread.status.changed",
      threadId: "thread-1",
      notificationId: "n-thread-interrupted",
      timestamp: "2026-06-08T00:00:02.000Z",
      payload: { value: "interrupted" },
    });

    expect(events.at(-1)).toMatchObject({
      type: "activity.changed",
      activeThreadId: "thread-1",
      status: "completed",
      latestSummary: "已中断",
      waitingRequest: null,
      error: null,
    });
  });

  it("preserves detailed thread error through later failed terminal events", () => {
    const events: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("activity-1", (event) => events.push(event));

    publisher.observe({
      type: "thread.error",
      threadId: "thread-1",
      notificationId: "n-error",
      timestamp: "2026-06-08T00:00:01.000Z",
      payload: { message: "provider failed with a useful reason" },
    });
    publisher.observe({
      type: "turn.completed",
      threadId: "thread-1",
      notificationId: "n-turn-failed",
      turnId: "turn-1",
      timestamp: "2026-06-08T00:00:02.000Z",
      payload: { status: "failed" },
    });
    publisher.observe({
      type: "thread.status.changed",
      threadId: "thread-1",
      notificationId: "n-thread-failed",
      timestamp: "2026-06-08T00:00:03.000Z",
      payload: { value: "failed" },
    });

    expect(events.at(-1)).toMatchObject({
      type: "activity.changed",
      activeThreadId: "thread-1",
      status: "error",
      latestSummary: "provider failed with a useful reason",
      waitingRequest: null,
      error: "provider failed with a useful reason",
    });
  });

  it("derives terminal states from thread status changes", () => {
    const events: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("activity-1", (event) => events.push(event));

    publisher.observe({
      type: "thread.status.changed",
      threadId: "thread-1",
      notificationId: "n-idle",
      timestamp: "2026-06-08T00:00:01.000Z",
      payload: { value: "idle" },
    });
    publisher.observe({
      type: "thread.status.changed",
      threadId: "thread-2",
      notificationId: "n-failed",
      timestamp: "2026-06-08T00:00:02.000Z",
      payload: { value: "failed" },
    });
    publisher.observe({
      type: "thread.status.changed",
      threadId: "thread-3",
      notificationId: "n-interrupted",
      timestamp: "2026-06-08T00:00:03.000Z",
      payload: { value: "interrupted" },
    });

    expect(events.slice(1).map((event) => ({
      activeThreadId: event.activeThreadId,
      status: event.status,
      latestSummary: event.latestSummary,
      error: event.error,
    }))).toEqual([
      {
        activeThreadId: "thread-1",
        status: "idle",
        latestSummary: "点击开始",
        error: null,
      },
      {
        activeThreadId: "thread-2",
        status: "error",
        latestSummary: "运行失败",
        error: "运行失败",
      },
      {
        activeThreadId: "thread-3",
        status: "completed",
        latestSummary: "已中断",
        error: null,
      },
    ]);
  });

  it("does not attribute thread errors without a thread id to the active thread", () => {
    const events: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("activity-1", (event) => events.push(event));

    publisher.observe({
      type: "turn.started",
      threadId: "thread-1",
      notificationId: "n-turn",
      turnId: "turn-1",
      timestamp: "2026-06-08T00:00:01.000Z",
      payload: {},
    });
    publisher.observe({
      type: "thread.error",
      notificationId: "n-connection-error",
      timestamp: "2026-06-08T00:00:02.000Z",
      payload: { message: "connection failed" },
    });

    expect(events.at(-1)).toMatchObject({
      type: "activity.changed",
      activeThreadId: null,
      status: "error",
      latestSummary: "connection failed",
      error: "connection failed",
    });
  });

  it("trims summaries, truncates long text, and preserves internal whitespace", () => {
    const events: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("activity-1", (event) => events.push(event));

    publisher.observe({
      type: "user.message.recorded",
      threadId: "thread-1",
      notificationId: "n-spaces",
      timestamp: "2026-06-08T00:00:01.000Z",
      payload: {
        messageId: "user-1",
        text: "  keep   multiple    spaces  ",
      },
    });

    const longText = `${"a".repeat(77)}bbbb`;
    publisher.observe({
      type: "user.message.recorded",
      threadId: "thread-1",
      notificationId: "n-long",
      timestamp: "2026-06-08T00:00:02.000Z",
      payload: {
        messageId: "user-2",
        text: ` \n${longText}\t `,
      },
    });

    expect(events.at(-2)?.latestSummary).toBe("keep   multiple    spaces");
    expect(events.at(-1)?.latestSummary).toBe(`${"a".repeat(77)}...`);
    expect(events.at(-1)?.latestSummary).toHaveLength(80);
  });

  it("truncates long tool names in started summaries", () => {
    const events: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("activity-1", (event) => events.push(event));

    publisher.observe({
      type: "tool.started",
      threadId: "thread-1",
      notificationId: "n-tool",
      turnId: "turn-1",
      itemId: "tool-1",
      timestamp: "2026-06-08T00:00:01.000Z",
      payload: { name: `tool.${"a".repeat(100)}`, input: {} },
    });

    expect(events.at(-1)?.latestSummary).toBe(`正在使用 tool.${"a".repeat(67)}...`);
    expect(events.at(-1)?.latestSummary).toHaveLength(80);
  });

  it("derives waiting states from server requests", () => {
    const events: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("activity-1", (event) => events.push(event));

    publisher.observe({
      type: "permission.requested",
      requestId: "thread-1:tool-1",
      threadId: "thread-1",
      timestamp: "2026-06-08T00:00:00.000Z",
      payload: {
        toolName: "file.write",
        toolCallId: "tool-1",
        arguments: { path: "a.txt" },
      },
    });
    publisher.observe({
      type: "workspace.requested",
      requestId: "thread-2:tool-2",
      threadId: "thread-2",
      timestamp: "2026-06-08T00:00:01.000Z",
      payload: {
        toolCallId: "tool-2",
        prompt: "请选择 workspace",
        candidates: [],
      },
    });

    expect(events.at(-2)).toMatchObject({
      type: "activity.changed",
      activeThreadId: "thread-1",
      status: "waiting",
      latestSummary: "等待权限确认",
      waitingRequest: "permission",
      error: null,
    });
    expect(events.at(-1)).toMatchObject({
      type: "activity.changed",
      activeThreadId: "thread-2",
      status: "waiting",
      latestSummary: "等待工作区选择",
      waitingRequest: "workspace",
      error: null,
    });
  });

  it("broadcasts changes to all current subscribers and stops sending to detached subscribers", () => {
    const first: AgentActivityEvent[] = [];
    const second: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("first", (event) => first.push(event));
    publisher.attachConnection("second", (event) => second.push(event));
    publisher.detachConnection("second");

    publisher.observe({
      type: "turn.started",
      threadId: "thread-1",
      notificationId: "n-turn",
      turnId: "turn-1",
      timestamp: "2026-06-08T00:00:00.000Z",
      payload: {},
    });

    expect(first.map((event) => event.type)).toEqual(["activity.snapshot", "activity.changed"]);
    expect(second.map((event) => event.type)).toEqual(["activity.snapshot"]);
  });

  it("continues notifying subscribers when one send throws", () => {
    const received: AgentActivityEvent[] = [];
    let shouldThrow = false;
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("healthy", (event) => received.push(event));
    publisher.attachConnection("throwing", () => {
      if (shouldThrow) {
        throw new Error("socket closed");
      }
    });
    shouldThrow = true;

    expect(() => publisher.observe({
      type: "turn.started",
      threadId: "thread-1",
      notificationId: "n-turn",
      turnId: "turn-1",
      timestamp: "2026-06-08T00:00:01.000Z",
      payload: {},
    })).not.toThrow();

    expect(received.at(-1)).toMatchObject({
      type: "activity.changed",
      activeThreadId: "thread-1",
      status: "running",
      latestSummary: "正在回复",
    });
  });
});
