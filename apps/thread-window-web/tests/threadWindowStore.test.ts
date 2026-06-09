import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThreadWindowStore } from "../src/store/threadWindowStore.ts";

const timestamp = "2026-06-06T00:00:00.000Z";

describe("threadWindowStore", () => {
  beforeEach(() => {
    createThreadWindowStore.setState(createThreadWindowStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates thread state from a started notification and keeps pending initial prompt without active UI state", () => {
    const store = createThreadWindowStore;
    store.getState().enqueueInitialPrompt({
      clientRequestId: "prompt-1",
      text: "hello",
      attachments: [],
      actionBinding: null,
    });

    store.getState().handleNotification({
      type: "thread.started",
      threadId: "thread-1",
      notificationId: "n1",
      commandId: "prompt-1",
      timestamp,
      payload: { preview: "hello" },
    });

    expect(store.getState().threadsById["thread-1"].pendingInitialPrompt?.text).toBe("hello");
    expect("activeTabId" in store.getState()).toBe(false);
    expect("tabs" in store.getState()).toBe(false);
  });

  it("ensures cached thread state without selecting a visible thread", () => {
    const store = createThreadWindowStore;

    store.getState().ensureThreadState("thread-1");

    expect(store.getState().threadsById["thread-1"]).toMatchObject({
      threadId: "thread-1",
      title: null,
      status: "idle",
      messages: [],
    });
    expect("activeTabId" in store.getState()).toBe(false);
  });

  it("merges snapshot without dropping pending initial user message", () => {
    const store = createThreadWindowStore;
    store.getState().enqueueInitialPrompt({
      clientRequestId: "prompt-1",
      text: "hello",
      attachments: [],
      actionBinding: null,
    });
    store.getState().handleNotification({
      type: "thread.started",
      threadId: "thread-1",
      notificationId: "n1",
      commandId: "prompt-1",
      timestamp,
      payload: { preview: "hello" },
    });
    store.getState().handleNotification({
      type: "thread.snapshot",
      threadId: "thread-1",
      notificationId: "n2",
      commandId: "resume-1",
      timestamp,
      payload: { messages: [], status: "running" },
    });

    expect(store.getState().threadsById["thread-1"].messages).toEqual([
      { id: "pending-prompt-1", role: "user", text: "hello", pending: true, attachments: [] },
    ]);
  });

  it("appends assistant delta and tool events", () => {
    const store = createThreadWindowStore;
    store.getState().ensureThreadState("thread-1");
    store.getState().handleNotification({
      type: "assistant.delta",
      threadId: "thread-1",
      notificationId: "n3",
      turnId: "turn-1",
      itemId: "assistant-1",
      timestamp,
      payload: { text: "hel" },
    });
    store.getState().handleNotification({
      type: "assistant.delta",
      threadId: "thread-1",
      notificationId: "n4",
      turnId: "turn-1",
      itemId: "assistant-1",
      timestamp,
      payload: { text: "lo" },
    });

    expect(store.getState().threadsById["thread-1"].messages[0].text).toBe("hello");
  });

  it("queues composer input while the thread is running without appending a user message", () => {
    const store = createThreadWindowStore;
    store.getState().ensureThreadState("thread-1");
    store.getState().handleNotification({
      type: "turn.started",
      threadId: "thread-1",
      notificationId: "n-running",
      turnId: "turn-1",
      timestamp,
      payload: {},
    });

    store.getState().queueComposerInput("thread-1", "second");

    const thread = store.getState().threadsById["thread-1"];
    expect(thread.messages).toEqual([]);
    expect(thread.queuedComposerInputs).toEqual([{ text: "second", attachments: [] }]);
    expect(store.getState().takeNextQueuedInputForDispatch("thread-1")).toBeNull();
  });

  it("dispatches queued composer input one item at a time after the thread leaves running", () => {
    const store = createThreadWindowStore;
    store.getState().ensureThreadState("thread-1");
    store.getState().handleNotification({
      type: "turn.started",
      threadId: "thread-1",
      notificationId: "n-running",
      turnId: "turn-1",
      timestamp,
      payload: {},
    });
    store.getState().queueComposerInput("thread-1", "second");
    store.getState().queueComposerInput("thread-1", "third");
    store.getState().handleNotification({
      type: "turn.completed",
      threadId: "thread-1",
      notificationId: "n-completed-1",
      turnId: "turn-1",
      timestamp,
      payload: { status: "completed" },
    });

    expect(store.getState().takeNextQueuedInputForDispatch("thread-1")).toEqual({
      text: "second",
      attachments: [],
    });
    expect(store.getState().takeNextQueuedInputForDispatch("thread-1")).toBeNull();

    store.getState().handleNotification({
      type: "turn.started",
      threadId: "thread-1",
      notificationId: "n-running-2",
      turnId: "turn-2",
      timestamp,
      payload: {},
    });
    store.getState().handleNotification({
      type: "turn.completed",
      threadId: "thread-1",
      notificationId: "n-completed-2",
      turnId: "turn-2",
      timestamp,
      payload: { status: "completed" },
    });

    expect(store.getState().takeNextQueuedInputForDispatch("thread-1")).toEqual({
      text: "third",
      attachments: [],
    });
    expect(store.getState().threadsById["thread-1"].queuedComposerInputs).toEqual([]);
  });

  it("removes a queued composer input by index", () => {
    const store = createThreadWindowStore;
    store.getState().ensureThreadState("thread-1");
    store.getState().queueComposerInput("thread-1", "first");
    store.getState().queueComposerInput("thread-1", "second");

    store.getState().removeQueuedComposerInput("thread-1", 0);

    expect(store.getState().threadsById["thread-1"].queuedComposerInputs).toEqual([
      { text: "second", attachments: [] },
    ]);
  });

  it("holds queued composer input while a submitted input is waiting for turn start", () => {
    const store = createThreadWindowStore;
    store.getState().ensureThreadState("thread-1");

    store.getState().markComposerInputDispatchPending("thread-1");
    store.getState().queueComposerInput("thread-1", "second");

    expect(store.getState().takeNextQueuedInputForDispatch("thread-1")).toBeNull();

    store.getState().handleNotification({
      type: "turn.started",
      threadId: "thread-1",
      notificationId: "n-running",
      turnId: "turn-1",
      timestamp,
      payload: {},
    });
    store.getState().handleNotification({
      type: "turn.completed",
      threadId: "thread-1",
      notificationId: "n-completed",
      turnId: "turn-1",
      timestamp,
      payload: { status: "completed" },
    });

    expect(store.getState().takeNextQueuedInputForDispatch("thread-1")).toEqual({
      text: "second",
      attachments: [],
    });
  });

  it("does not append duplicate assistant delta notifications", () => {
    const store = createThreadWindowStore;
    store.getState().ensureThreadState("thread-1");

    const notification = {
      type: "assistant.delta" as const,
      threadId: "thread-1",
      notificationId: "n3",
      turnId: "turn-1",
      itemId: "assistant-1",
      timestamp,
      payload: { text: "hel" },
    };

    store.getState().handleNotification(notification);
    store.getState().handleNotification(notification);

    expect(store.getState().threadsById["thread-1"].messages[0].text).toBe("hel");
  });

  it("only removes history and thread state when delete status is deleted", () => {
    const store = createThreadWindowStore;
    store.setState({
      history: [{
        id: "thread-1",
        preview: "hello",
        createdAt: timestamp,
        updatedAt: timestamp,
        messageCount: 1,
      }],
    });
    store.getState().ensureThreadState("thread-1");

    store.getState().handleNotification({
      type: "thread.deleted",
      notificationId: "n-delete-1",
      commandId: "delete-1",
      timestamp,
      payload: { targetThreadId: "thread-1", status: "not_found" },
    });

    expect(store.getState().history.map((item) => item.id)).toEqual(["thread-1"]);
    expect(store.getState().threadsById["thread-1"]).toBeDefined();

    store.getState().handleNotification({
      type: "thread.deleted",
      notificationId: "n-delete-2",
      commandId: "delete-2",
      timestamp,
      payload: { targetThreadId: "thread-1", status: "deleted" },
    });

    expect(store.getState().history).toEqual([]);
    expect(store.getState().threadsById["thread-1"]).toBeUndefined();
  });

  it("stores workspaces from workspace.listed notifications", () => {
    const store = createThreadWindowStore;

    store.getState().handleNotification({
      type: "workspace.listed",
      notificationId: "n-workspaces",
      commandId: "workspace-list-1",
      timestamp,
      payload: {
        workspaces: [
          { id: "tmp", name: "tmp", rootPath: "/tmp" },
          { id: "handagent-test", name: "handagent-test", rootPath: "/handagent" },
        ],
      },
    });

    expect(store.getState().workspaces.map((workspace) => workspace.name)).toEqual([
      "tmp",
      "handagent-test",
    ]);
  });

  it("toggles workspace expansion ids", () => {
    const store = createThreadWindowStore;

    expect(store.getState().expandedWorkspaceIds.has("default")).toBe(false);

    store.getState().toggleWorkspaceExpanded("default");
    expect(store.getState().expandedWorkspaceIds.has("default")).toBe(true);

    store.getState().toggleWorkspaceExpanded("default");
    expect(store.getState().expandedWorkspaceIds.has("default")).toBe(false);
  });

  it("persists workspace expansion ids when they change", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { setItem } });

    const store = createThreadWindowStore;
    store.getState().toggleWorkspaceExpanded("default");

    expect(setItem).toHaveBeenCalledWith(
      "handAgent.threadWindow.expandedWorkspaceIds",
      JSON.stringify(["default"]),
    );

    vi.unstubAllGlobals();
  });

  it("clears pending initial prompt and exposes window error when thread error has only commandId", () => {
    const store = createThreadWindowStore;
    store.getState().enqueueInitialPrompt({
      clientRequestId: "prompt-1",
      text: "hello",
      attachments: [],
      actionBinding: null,
    });

    store.getState().handleNotification({
      type: "thread.error",
      notificationId: "n-error-1",
      commandId: "prompt-1",
      timestamp,
      payload: { message: "failed before thread creation" },
    });

    expect(store.getState().pendingInitialPrompts["prompt-1"]).toBeUndefined();
    expect(store.getState().windowErrorMessage).toBe("failed before thread creation");
  });

  it("stores permission and workspace requests by thread", () => {
    const store = createThreadWindowStore;
    store.getState().ensureThreadState("thread-1");
    store.getState().handleRequest({
      type: "permission.requested",
      requestId: "thread-1:req-1",
      threadId: "thread-1",
      timestamp,
      payload: { toolName: "file.write", toolCallId: "tool-1", arguments: { path: "a.txt" } },
    });
    store.getState().handleRequest({
      type: "workspace.requested",
      requestId: "thread-1:req-2",
      threadId: "thread-1",
      timestamp,
      payload: { prompt: "Pick", candidates: [] },
    });

    expect(store.getState().threadsById["thread-1"].permissionRequests).toHaveLength(1);
    expect(store.getState().threadsById["thread-1"].workspaceRequests).toHaveLength(1);
  });

  it("removes answered requests through explicit store actions", () => {
    const store = createThreadWindowStore;
    store.getState().ensureThreadState("thread-1");
    store.getState().handleRequest({
      type: "permission.requested",
      requestId: "thread-1:req-1",
      threadId: "thread-1",
      timestamp,
      payload: { toolName: "file.write", toolCallId: "tool-1", arguments: { path: "a.txt" } },
    });
    store.getState().handleRequest({
      type: "workspace.requested",
      requestId: "thread-1:req-2",
      threadId: "thread-1",
      timestamp,
      payload: { prompt: "Pick", candidates: [] },
    });

    store.getState().resolvePermissionRequest("thread-1:req-1");
    store.getState().resolveWorkspaceRequest("thread-1:req-2");

    expect(store.getState().threadsById["thread-1"].permissionRequests).toEqual([]);
    expect(store.getState().threadsById["thread-1"].workspaceRequests).toEqual([]);
  });
});
