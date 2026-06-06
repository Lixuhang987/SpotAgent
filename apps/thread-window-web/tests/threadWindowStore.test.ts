import { beforeEach, describe, expect, it } from "vitest";
import { createThreadWindowStore } from "../src/store/threadWindowStore.ts";

const timestamp = "2026-06-06T00:00:00.000Z";

describe("threadWindowStore", () => {
  beforeEach(() => {
    createThreadWindowStore.setState(createThreadWindowStore.getInitialState(), true);
  });

  it("creates a tab from a started notification and keeps pending initial prompt", () => {
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

    expect(store.getState().activeTabId).toBe("thread-1");
    expect(store.getState().tabs["thread-1"].pendingInitialPrompt?.text).toBe("hello");
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

    expect(store.getState().tabs["thread-1"].messages).toEqual([
      { id: "pending-prompt-1", role: "user", text: "hello", pending: true, attachments: [] },
    ]);
  });

  it("appends assistant delta and tool events", () => {
    const store = createThreadWindowStore;
    store.getState().openHistoryThread("thread-1");
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

    expect(store.getState().tabs["thread-1"].messages[0].text).toBe("hello");
  });

  it("stores permission and workspace requests by thread", () => {
    const store = createThreadWindowStore;
    store.getState().openHistoryThread("thread-1");
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

    expect(store.getState().tabs["thread-1"].permissionRequests).toHaveLength(1);
    expect(store.getState().tabs["thread-1"].workspaceRequests).toHaveLength(1);
  });

  it("removes answered requests through explicit store actions", () => {
    const store = createThreadWindowStore;
    store.getState().openHistoryThread("thread-1");
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

    expect(store.getState().tabs["thread-1"].permissionRequests).toEqual([]);
    expect(store.getState().tabs["thread-1"].workspaceRequests).toEqual([]);
  });
});
