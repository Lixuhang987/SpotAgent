import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent } from "@handagent/core/runtime/AgentRuntime.ts";
import type { SessionMessage } from "@handagent/core/protocol/SessionMessage.ts";
import { InMemorySessionStore } from "@handagent/core/storage/index.ts";
import { handleSocketMessage } from "../../src/server.ts";
import { SessionPersistence } from "../../src/SessionPersistence.ts";
import { SessionRouter } from "../../src/SessionRouter.ts";
import { SessionRuntimeOrchestrator } from "../../src/SessionRuntimeOrchestrator.ts";

function createUserMessage(
  sessionId: string,
  text: string,
  messageId: string,
): Extract<SessionMessage, { type: "user_message" }> {
  return {
    type: "user_message",
    sessionId,
    messageId,
    timestamp: "2026-05-11T10:00:00.000Z",
    payload: { text },
  };
}

describe("SessionRouter", () => {
  it("formats list and load session responses", async () => {
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-14T00:00:00.000Z",
    );
    const router = new SessionRouter(
      {
        async handleUserMessage() {},
      },
      persistence,
      () => "2026-05-18T00:00:00.000Z",
    );
    const pushed: SessionMessage[] = [];

    await persistence.ensureSession("session-1");
    await persistence.persistUserMessage("session-1", "hello");
    await persistence.autoTitle("session-1", "hello");

    await router.receive(
      {
        type: "list_sessions_request",
        sessionId: "request-session",
        messageId: "list-1",
        timestamp: "2026-05-18T00:00:00.000Z",
        payload: {},
      },
      (message) => pushed.push(message),
    );
    await router.receive(
      {
        type: "load_session_request",
        sessionId: "request-session",
        messageId: "load-1",
        timestamp: "2026-05-18T00:00:00.000Z",
        payload: { targetSessionId: "session-1" },
      },
      (message) => pushed.push(message),
    );

    expect(pushed).toEqual([
      {
        type: "list_sessions_response",
        sessionId: "request-session",
        messageId: "list-1",
        timestamp: "2026-05-18T00:00:00.000Z",
        payload: {
          sessions: [
            {
              id: "session-1",
              title: "hello",
              createdAt: "2026-05-14T00:00:00.000Z",
              updatedAt: "2026-05-14T00:00:00.000Z",
              messageCount: 1,
              workspaceId: null,
            },
          ],
        },
      },
      {
        type: "load_session_response",
        sessionId: "request-session",
        messageId: "load-1",
        timestamp: "2026-05-18T00:00:00.000Z",
        payload: {
          targetSessionId: "session-1",
          title: "hello",
          messages: [
            {
              id: "msg-0",
              role: "user",
              text: "hello",
              status: "completed",
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
          ],
        },
      },
    ]);
  });

  it("returns a session snapshot when open_session reconnects to stored history", async () => {
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-18T00:00:00.000Z",
    );
    const router = new SessionRouter(
      {
        async handleUserMessage() {},
      },
      persistence,
      () => "2026-05-18T00:02:00.000Z",
    );
    const pushed: SessionMessage[] = [];

    await store.create({
      id: "session-reconnect",
      createdAt: "2026-05-18T00:00:00.000Z",
    });
    await store.appendMessages(
      "session-reconnect",
      [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
      "2026-05-18T00:01:00.000Z",
    );

    await router.receive(
      {
        type: "open_session",
        sessionId: "session-reconnect",
        messageId: "open-1",
        timestamp: "2026-05-18T00:02:00.000Z",
        payload: {},
      },
      (message) => pushed.push(message),
    );

    expect(pushed).toEqual([
      {
        type: "session_snapshot",
        sessionId: "session-reconnect",
        messageId: "open-1",
        timestamp: "2026-05-18T00:02:00.000Z",
        payload: {
          messages: [
            {
              id: "msg-0",
              role: "user",
              text: "hello",
              status: "completed",
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
            {
              id: "msg-1",
              role: "assistant",
              text: "hi",
              status: "completed",
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
          ],
          status: "idle",
        },
      },
    ]);
  });

  it("marks an incomplete persisted turn as failed when open_session reconnects after runtime loss", async () => {
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-18T00:00:00.000Z",
    );
    const router = new SessionRouter(
      {
        async handleUserMessage() {},
      },
      persistence,
      () => "2026-05-18T00:02:00.000Z",
    );
    const pushed: SessionMessage[] = [];

    await store.create({
      id: "session-incomplete",
      createdAt: "2026-05-18T00:00:00.000Z",
    });
    await store.appendMessages(
      "session-incomplete",
      [{ role: "user", content: "slow prompt" }],
      "2026-05-18T00:01:00.000Z",
    );

    await router.receive(
      {
        type: "open_session",
        sessionId: "session-incomplete",
        messageId: "open-1",
        timestamp: "2026-05-18T00:02:00.000Z",
        payload: {},
      },
      (message) => pushed.push(message),
    );

    expect(pushed).toEqual([
      {
        type: "session_snapshot",
        sessionId: "session-incomplete",
        messageId: "open-1",
        timestamp: "2026-05-18T00:02:00.000Z",
        payload: {
          messages: [
            {
              id: "msg-0",
              role: "user",
              text: "slow prompt",
              status: "completed",
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
            {
              id: "msg-1",
              role: "assistant",
              text: "本轮运行因 agent-server 重启而中断，请重新发送请求。",
              status: "completed",
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
          ],
          status: "failed",
        },
      },
    ]);
    expect((await persistence.getSession("session-incomplete"))?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-18T00:02:00.000Z",
        message: "本轮运行因 agent-server 重启而中断，请重新发送请求。",
        code: "run_lost_after_restart",
      },
    ]);
  });

  it("keeps a user-interrupted incomplete turn interrupted when open_session reconnects", async () => {
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-18T00:00:00.000Z",
    );
    const router = new SessionRouter(
      {
        async handleUserMessage() {},
      },
      persistence,
      () => "2026-05-18T00:02:00.000Z",
    );
    const pushed: SessionMessage[] = [];

    await store.create({
      id: "session-user-interrupted",
      createdAt: "2026-05-18T00:00:00.000Z",
    });
    await store.appendMessages(
      "session-user-interrupted",
      [{ role: "user", content: "stopped prompt" }],
      "2026-05-18T00:01:00.000Z",
    );
    await store.appendEvents("session-user-interrupted", [
      {
        type: "error",
        timestamp: "2026-05-18T00:01:30.000Z",
        message: "本轮运行已中断。",
        code: "run_interrupted",
      },
    ]);

    await router.receive(
      {
        type: "open_session",
        sessionId: "session-user-interrupted",
        messageId: "open-1",
        timestamp: "2026-05-18T00:02:00.000Z",
        payload: {},
      },
      (message) => pushed.push(message),
    );

    expect(pushed).toEqual([
      {
        type: "session_snapshot",
        sessionId: "session-user-interrupted",
        messageId: "open-1",
        timestamp: "2026-05-18T00:02:00.000Z",
        payload: {
          messages: [
            {
              id: "msg-0",
              role: "user",
              text: "stopped prompt",
              status: "completed",
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
          ],
          status: "interrupted",
        },
      },
    ]);
    expect((await persistence.getSession("session-user-interrupted"))?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-18T00:01:30.000Z",
        message: "本轮运行已中断。",
        code: "run_interrupted",
      },
    ]);
  });

  it("does not reuse an older error when recovering a later incomplete turn", async () => {
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-18T00:00:00.000Z",
    );
    const router = new SessionRouter(
      {
        async handleUserMessage() {},
      },
      persistence,
      () => "2026-05-18T00:04:00.000Z",
    );
    const pushed: SessionMessage[] = [];

    await store.create({
      id: "session-new-incomplete-after-error",
      createdAt: "2026-05-18T00:00:00.000Z",
    });
    await store.appendMessages(
      "session-new-incomplete-after-error",
      [
        { role: "user", content: "old prompt" },
        { role: "assistant", content: "old failure" },
      ],
      "2026-05-18T00:01:00.000Z",
    );
    await store.appendEvents("session-new-incomplete-after-error", [
      {
        type: "error",
        timestamp: "2026-05-18T00:01:30.000Z",
        message: "old runtime error",
      },
    ]);
    await store.appendMessages(
      "session-new-incomplete-after-error",
      [{ role: "user", content: "new slow prompt" }],
      "2026-05-18T00:03:00.000Z",
    );

    await router.receive(
      {
        type: "open_session",
        sessionId: "session-new-incomplete-after-error",
        messageId: "open-1",
        timestamp: "2026-05-18T00:04:00.000Z",
        payload: {},
      },
      (message) => pushed.push(message),
    );

    expect(pushed).toEqual([
      {
        type: "session_snapshot",
        sessionId: "session-new-incomplete-after-error",
        messageId: "open-1",
        timestamp: "2026-05-18T00:04:00.000Z",
        payload: {
          messages: [
            {
              id: "msg-0",
              role: "user",
              text: "old prompt",
              status: "completed",
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
            {
              id: "msg-1",
              role: "assistant",
              text: "old failure",
              status: "completed",
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
            {
              id: "msg-2",
              role: "user",
              text: "new slow prompt",
              status: "completed",
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
            {
              id: "msg-3",
              role: "assistant",
              text: "本轮运行因 agent-server 重启而中断，请重新发送请求。",
              status: "completed",
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
          ],
          status: "failed",
        },
      },
    ]);
    expect((await persistence.getSession("session-new-incomplete-after-error"))?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-18T00:01:30.000Z",
        message: "old runtime error",
      },
      {
        type: "error",
        timestamp: "2026-05-18T00:04:00.000Z",
        message: "本轮运行因 agent-server 重启而中断，请重新发送请求。",
        code: "run_lost_after_restart",
      },
    ]);
  });

  it("restores a current runtime error when recovering an incomplete turn", async () => {
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-18T00:00:00.000Z",
    );
    const router = new SessionRouter(
      {
        async handleUserMessage() {},
      },
      persistence,
      () => "2026-05-18T00:04:00.000Z",
    );
    const pushed: SessionMessage[] = [];

    await store.create({
      id: "session-current-error",
      createdAt: "2026-05-18T00:00:00.000Z",
    });
    await store.appendMessages(
      "session-current-error",
      [{ role: "user", content: "new slow prompt" }],
      "2026-05-18T00:03:00.000Z",
    );
    await store.appendEvents("session-current-error", [
      {
        type: "error",
        timestamp: "2026-05-18T00:03:30.000Z",
        message: "provider failed",
      },
    ]);

    await router.receive(
      {
        type: "open_session",
        sessionId: "session-current-error",
        messageId: "open-1",
        timestamp: "2026-05-18T00:04:00.000Z",
        payload: {},
      },
      (message) => pushed.push(message),
    );

    expect(pushed).toEqual([
      {
        type: "session_snapshot",
        sessionId: "session-current-error",
        messageId: "open-1",
        timestamp: "2026-05-18T00:04:00.000Z",
        payload: {
          messages: [
            {
              id: "msg-0",
              role: "user",
              text: "new slow prompt",
              status: "completed",
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
            {
              id: "msg-1",
              role: "assistant",
              text: "provider failed",
              status: "completed",
              createdAt: "1970-01-01T00:00:00.000Z",
              updatedAt: "1970-01-01T00:00:00.000Z",
            },
          ],
          status: "failed",
        },
      },
    ]);
    expect((await persistence.getSession("session-current-error"))?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-18T00:03:30.000Z",
        message: "provider failed",
      },
    ]);
  });

  it("returns session_open_failed when open_session targets missing history", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-18T00:00:00.000Z",
    );
    const router = new SessionRouter(
      {
        async handleUserMessage() {},
      },
      persistence,
      () => "2026-05-18T00:02:00.000Z",
    );
    const pushed: SessionMessage[] = [];

    await router.receive(
      {
        type: "open_session",
        sessionId: "missing-session",
        messageId: "open-1",
        timestamp: "2026-05-18T00:02:00.000Z",
        payload: {},
      },
      (message) => pushed.push(message),
    );

    expect(pushed).toEqual([
      {
        type: "session_open_failed",
        sessionId: "missing-session",
        messageId: "open-1",
        timestamp: "2026-05-18T00:02:00.000Z",
        payload: {
          reason: "not_found",
          message: "Session not found: missing-session",
        },
      },
    ]);
    expect(await persistence.getSession("missing-session")).toBeNull();
  });

  it("rejects user_message for missing session without creating it", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-20T00:00:00.000Z",
    );
    const handled: SessionMessage[] = [];
    const router = new SessionRouter(
      {
        async handleUserMessage(message) {
          handled.push(message);
        },
        interruptSession() {},
      },
      persistence,
      () => "2026-05-20T00:01:00.000Z",
    );
    const pushed: SessionMessage[] = [];

    await router.receive(
      createUserMessage("missing-session", "hello", "user-1"),
      (message) => pushed.push(message),
    );

    expect(handled).toEqual([]);
    expect(pushed).toEqual([
      {
        type: "user_message_failed",
        sessionId: "missing-session",
        messageId: "user-1",
        timestamp: "2026-05-20T00:01:00.000Z",
        payload: {
          reason: "session_not_found",
          message: "Session not found: missing-session",
        },
      },
    ]);
    expect(await persistence.getSession("missing-session")).toBeNull();
  });

  it("creates a session explicitly and starts the initial prompt", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-20T00:00:00.000Z",
    );
    const handled: SessionMessage[] = [];
    const router = new SessionRouter(
      {
        async handleUserMessage(message, push) {
          handled.push(message);
          push({
            type: "status",
            sessionId: message.sessionId,
            messageId: `${message.sessionId}-status`,
            timestamp: "2026-05-20T00:01:00.000Z",
            payload: { value: "running" },
          });
        },
        interruptSession() {},
      },
      persistence,
      () => "2026-05-20T00:01:00.000Z",
    );
    const pushed: SessionMessage[] = [];

    await router.receive(
      {
        type: "create_session_request",
        sessionId: "",
        messageId: "create-1",
        timestamp: "2026-05-20T00:01:00.000Z",
        payload: { initialText: "hello" },
      },
      (message) => pushed.push(message),
    );

    expect(pushed[0]?.type).toBe("create_session_response");
    expect(pushed[0]?.messageId).toBe("create-1");
    const createdSessionId = pushed[0]?.sessionId;
    expect(createdSessionId).toMatch(/^session-/);
    expect(await persistence.getSession(createdSessionId!)).not.toBeNull();
    expect(handled).toEqual([
      {
        type: "user_message",
        sessionId: createdSessionId,
        messageId: "create-1-initial-user",
        timestamp: "2026-05-20T00:01:00.000Z",
        payload: { text: "hello", attachments: undefined },
      },
    ]);
    expect(pushed[1]).toEqual({
      type: "status",
      sessionId: createdSessionId,
      messageId: `${createdSessionId}-status`,
      timestamp: "2026-05-20T00:01:00.000Z",
      payload: { value: "running" },
    });
  });

  it("persists action binding from create_session_request", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-21T00:00:00.000Z",
    );
    const router = new SessionRouter(
      { async handleUserMessage() {} },
      persistence,
      () => "2026-05-21T00:01:00.000Z",
      {
        async resolve(binding) {
          expect(binding).toEqual({
            pluginId: "review",
            promptName: "code_review",
          });
          return {
            pluginId: "review",
            promptName: "code_review",
            mcpServerIds: ["github"],
          };
        },
      },
    );
    const pushed: SessionMessage[] = [];

    await router.receive(
      {
        type: "create_session_request",
        sessionId: "",
        messageId: "create-action",
        timestamp: "2026-05-21T00:01:00.000Z",
        payload: {
          initialText: "Review:\\ncode",
          actionBinding: { pluginId: "review", promptName: "code_review" },
        },
      },
      (message) => pushed.push(message),
    );

    const created = await persistence.getSession(pushed[0].sessionId);
    expect(created?.metadata.actionBinding).toEqual({
      pluginId: "review",
      promptName: "code_review",
      mcpServerIds: ["github"],
    });
  });

  it("returns delete_session_response after deleting existing session", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-20T00:00:00.000Z",
    );
    const router = new SessionRouter(
      { async handleUserMessage() {}, interruptSession() {}, async interruptAndWait() {} },
      persistence,
      () => "2026-05-20T00:01:00.000Z",
    );
    const pushed: SessionMessage[] = [];

    await persistence.ensureSession("session-delete");
    await router.receive(
      {
        type: "delete_session_request",
        sessionId: "request-session",
        messageId: "delete-1",
        timestamp: "2026-05-20T00:01:00.000Z",
        payload: { targetSessionId: "session-delete" },
      },
      (message) => pushed.push(message),
    );

    expect(await persistence.getSession("session-delete")).toBeNull();
    expect(pushed).toEqual([
      {
        type: "delete_session_response",
        sessionId: "request-session",
        messageId: "delete-1",
        timestamp: "2026-05-20T00:01:00.000Z",
        payload: {
          targetSessionId: "session-delete",
          status: "deleted",
        },
      },
    ]);
  });

  it("interrupts running session before deleting it", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-20T00:00:00.000Z",
    );
    const calls: string[] = [];
    const router = new SessionRouter(
      {
        async handleUserMessage() {},
        interruptSession() {},
        async interruptAndWait(sessionId: string) {
          calls.push(`interrupt:${sessionId}`);
        },
        isSessionRunning(sessionId: string) {
          return sessionId === "session-running";
        },
      },
      persistence,
      () => "2026-05-20T00:01:00.000Z",
    );
    const pushed: SessionMessage[] = [];

    await persistence.ensureSession("session-running");
    await router.receive(
      {
        type: "delete_session_request",
        sessionId: "request-session",
        messageId: "delete-1",
        timestamp: "2026-05-20T00:01:00.000Z",
        payload: { targetSessionId: "session-running" },
      },
      (message) => pushed.push(message),
    );

    expect(calls).toEqual(["interrupt:session-running"]);
    expect(await persistence.getSession("session-running")).toBeNull();
    expect(pushed[0]?.type).toBe("delete_session_response");
  });

  it("returns delete_session_response when a running session ignores abort", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-22T00:00:00.000Z",
    );
    const runStarted = Promise.withResolvers<void>();
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        runWithMessages() {
          runStarted.resolve();
          return new Promise(() => {});
        },
      },
      persistence,
      () => "2026-05-22T00:00:00.000Z",
      () => {},
      { interruptWaitTimeoutMs: 20, interruptPollIntervalMs: 1 },
    );
    const router = new SessionRouter(
      orchestrator,
      persistence,
      () => "2026-05-22T00:01:00.000Z",
    );
    const pushed: SessionMessage[] = [];

    await persistence.ensureSession("session-stubborn-delete");
    void router.receive(
      createUserMessage("session-stubborn-delete", "删除中", "user-1"),
      (message) => pushed.push(message),
    );
    await runStarted.promise;

    const outcome = await Promise.race([
      router.receive(
        {
          type: "delete_session_request",
          sessionId: "request-session",
          messageId: "delete-1",
          timestamp: "2026-05-22T00:01:00.000Z",
          payload: { targetSessionId: "session-stubborn-delete" },
        },
        (message) => pushed.push(message),
      ).then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve("timed-out"), 100)),
    ]);

    expect(outcome).toBe("resolved");
    expect(await persistence.getSession("session-stubborn-delete")).toBeNull();
    expect(pushed.at(-1)).toEqual({
      type: "delete_session_response",
      sessionId: "request-session",
      messageId: "delete-1",
      timestamp: "2026-05-22T00:01:00.000Z",
      payload: {
        targetSessionId: "session-stubborn-delete",
        status: "deleted",
      },
    });
  });

  it("dispatches deletes and user messages to their owning modules", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-17T00:00:00.000Z",
    );
    const handledMessages: SessionMessage[] = [];
    const router = new SessionRouter(
      {
        async handleUserMessage(message) {
          handledMessages.push(message);
        },
      },
      persistence,
      () => "2026-05-18T00:00:00.000Z",
    );

    await persistence.ensureSession("session-delete");
    await router.receive(
      {
        type: "delete_session_request",
        sessionId: "request-session",
        messageId: "delete-1",
        timestamp: "2026-05-18T00:00:00.000Z",
        payload: { targetSessionId: "session-delete" },
      },
      () => {},
    );
    await persistence.ensureSession("session-user");
    await router.receive(createUserMessage("session-user", "hello", "user-1"), () => {});

    expect(await persistence.getSession("session-delete")).toBeNull();
    expect(handledMessages).toEqual([
      createUserMessage("session-user", "hello", "user-1"),
    ]);
  });

  it("calls onSessionDeleted hook after persistence.deleteSession", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-23T00:00:00.000Z",
    );
    const deletedIds: string[] = [];
    const deleteOrder: string[] = [];

    // Wrap persistence.deleteSession to record call order
    const originalDelete = persistence.deleteSession.bind(persistence);
    persistence.deleteSession = async (sessionId: string) => {
      await originalDelete(sessionId);
      deleteOrder.push(`persistence:${sessionId}`);
    };

    const router = new SessionRouter(
      { async handleUserMessage() {}, interruptSession() {}, async interruptAndWait() {} },
      persistence,
      () => "2026-05-23T00:01:00.000Z",
      undefined,
      (sessionId) => {
        deleteOrder.push(`hook:${sessionId}`);
        deletedIds.push(sessionId);
      },
    );

    await persistence.ensureSession("session-hook-test");
    await router.receive(
      {
        type: "delete_session_request",
        sessionId: "request-session",
        messageId: "delete-hook-1",
        timestamp: "2026-05-23T00:01:00.000Z",
        payload: { targetSessionId: "session-hook-test" },
      },
      () => {},
    );

    expect(deletedIds).toEqual(["session-hook-test"]);
    // hook must fire AFTER persistence.deleteSession
    expect(deleteOrder).toEqual(["persistence:session-hook-test", "hook:session-hook-test"]);
    expect(await persistence.getSession("session-hook-test")).toBeNull();
  });

  it("routes interrupt frames to the runtime orchestrator", async () => {
    const interrupted: string[] = [];
    const router = new SessionRouter(
      {
        async handleUserMessage() {},
        interruptSession(sessionId: string) {
          interrupted.push(sessionId);
        },
      },
      new SessionPersistence(
        new InMemorySessionStore(),
        () => "2026-05-17T00:00:00.000Z",
      ),
      () => "2026-05-18T00:00:00.000Z",
    );

    await router.receive(
      {
        type: "interrupt",
        sessionId: "session-stop",
        messageId: "interrupt-1",
        timestamp: "2026-05-18T00:00:00.000Z",
        payload: {},
      },
      () => {},
    );

    expect(interrupted).toEqual(["session-stop"]);
  });

  it("exposes convenience methods backed by persistence", async () => {
    const router = new SessionRouter(
      {
        async handleUserMessage() {},
      },
      new SessionPersistence(
        new InMemorySessionStore(),
        () => "2026-05-17T00:00:00.000Z",
      ),
      () => "2026-05-18T00:00:00.000Z",
    );

    const session = await router.createSession("测试会话");
    await router.renameSession(session.metadata.id, "新标题");
    expect((await router.getSession(session.metadata.id))?.metadata.title).toBe("新标题");
    expect(await router.listSessions()).toHaveLength(1);
    expect(await router.getSessionHistory(session.metadata.id)).toEqual([]);
    await router.deleteSession(session.metadata.id);
    expect(await router.getSession(session.metadata.id)).toBeNull();
  });

  it("passes workspaceId through create and includes it in list response", async () => {
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-22T00:00:00.000Z",
    );
    const router = new SessionRouter(
      { async handleUserMessage() {} },
      persistence,
      () => "2026-05-22T00:00:00.000Z",
    );
    const pushed: SessionMessage[] = [];

    await router.receive(
      {
        type: "create_session_request",
        sessionId: "",
        messageId: "create-1",
        timestamp: "2026-05-22T00:00:00.000Z",
        payload: { workspaceId: "ws-abc" },
      },
      (message) => pushed.push(message),
    );

    await router.receive(
      {
        type: "list_sessions_request",
        sessionId: "",
        messageId: "list-1",
        timestamp: "2026-05-22T00:00:00.000Z",
        payload: {},
      },
      (message) => pushed.push(message),
    );

    const listResponse = pushed.find((m) => m.type === "list_sessions_response");
    expect(listResponse).toBeDefined();
    if (listResponse?.type === "list_sessions_response") {
      expect(listResponse.payload.sessions[0].workspaceId).toBe("ws-abc");
    }
  });

  it("forwards websocket messages through SessionRouter and sends outgoing JSON", async () => {
    const sent: string[] = [];
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-11T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async runWithMessages(
          messages: AgentMessage[],
          onEvent: (event: AgentRuntimeEvent) => void,
        ) {
          void messages;
          onEvent({
            type: "assistant_message_start",
            messageId: "assistant-1",
            payload: { role: "assistant" },
          });
          onEvent({
            type: "assistant_message_delta",
            messageId: "assistant-1",
            payload: { text: "ws reply" },
          });
          onEvent({
            type: "assistant_message_end",
            messageId: "assistant-1",
            payload: { status: "completed" },
          });
          return {
            messages: [
              {
                role: "user" as const,
                content: "hello",
              },
              {
                role: "assistant" as const,
                content: "ws reply",
              },
            ],
            bubbles: [],
          };
        },
      },
      persistence,
      () => "2026-05-11T00:00:00.000Z",
    );
    const router = new SessionRouter(
      orchestrator,
      persistence,
      () => "2026-05-11T00:00:00.000Z",
    );

    await persistence.ensureSession("session-3");
    await handleSocketMessage(
      router,
      {
        send(value: string) {
          sent.push(value);
        },
      },
      JSON.stringify(createUserMessage("session-3", "hello", "user-1")),
    );

    expect(sent).toEqual([
      JSON.stringify({
        type: "assistant_message_start",
        sessionId: "session-3",
        messageId: "session-3-assistant-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: { role: "assistant" },
      }),
      JSON.stringify({
        type: "assistant_message_delta",
        sessionId: "session-3",
        messageId: "session-3-assistant-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: { text: "ws reply" },
      }),
      JSON.stringify({
        type: "assistant_message_end",
        sessionId: "session-3",
        messageId: "session-3-assistant-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: { status: "completed" },
      }),
    ]);
  });
});
