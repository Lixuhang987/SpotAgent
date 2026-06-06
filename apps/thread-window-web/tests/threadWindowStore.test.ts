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

  it("does not append duplicate assistant delta notifications", () => {
    const store = createThreadWindowStore;
    store.getState().openHistoryThread("thread-1");

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

    expect(store.getState().tabs["thread-1"].messages[0].text).toBe("hel");
  });

  it("only removes history and tabs when delete status is deleted", () => {
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
    store.getState().openHistoryThread("thread-1");

    store.getState().handleNotification({
      type: "thread.deleted",
      notificationId: "n-delete-1",
      commandId: "delete-1",
      timestamp,
      payload: { targetThreadId: "thread-1", status: "not_found" },
    });

    expect(store.getState().history.map((item) => item.id)).toEqual(["thread-1"]);
    expect(store.getState().tabs["thread-1"]).toBeDefined();
    expect(store.getState().activeTabId).toBe("thread-1");

    store.getState().handleNotification({
      type: "thread.deleted",
      notificationId: "n-delete-2",
      commandId: "delete-2",
      timestamp,
      payload: { targetThreadId: "thread-1", status: "deleted" },
    });

    expect(store.getState().history).toEqual([]);
    expect(store.getState().tabs["thread-1"]).toBeUndefined();
    expect(store.getState().activeTabId).toBeNull();
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
