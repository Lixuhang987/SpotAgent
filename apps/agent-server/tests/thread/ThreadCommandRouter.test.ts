import { describe, expect, it, vi } from "vitest";
import { InMemoryThreadStore } from "@handagent/core/storage/index.ts";
import type { ThreadCommand } from "@handagent/core/protocol/ThreadCommand.ts";
import type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";
import { ThreadPersistence } from "../../src/thread/ThreadPersistence.ts";
import { ThreadNotificationPublisher } from "../../src/thread/ThreadNotificationPublisher.ts";
import { ThreadCommandRouter } from "../../src/thread/ThreadCommandRouter.ts";

describe("ThreadCommandRouter", () => {
  it("creates a thread and emits thread.started to the issuing connection", async () => {
    const publisher = new ThreadNotificationPublisher();
    const sent: string[] = [];
    publisher.attachConnection("c1", (event) => sent.push(event.type));
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    const router = new ThreadCommandRouter(
      { submitInput: vi.fn(async () => {}) },
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
    );

    await router.receive(createCommand(), "c1");

    expect(sent).toEqual(["thread.started"]);
  });

  it("persists workspaceId when creating a thread with workspace", async () => {
    const store = new InMemoryThreadStore();
    const publisher = new ThreadNotificationPublisher();
    publisher.attachConnection("c1", () => {});
    const persistence = new ThreadPersistence(
      store,
      () => "2026-06-04T00:00:00.000Z",
    );
    const router = new ThreadCommandRouter(
      { submitInput: vi.fn(async () => {}) },
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
    );

    const command: Extract<ThreadCommand, { type: "thread.start" }> = {
      type: "thread.start",
      commandId: "create-ws-1",
      timestamp: "2026-06-04T00:00:00.000Z",
      payload: {
        workspaceId: "workspace-123",
        actionBinding: null,
      },
    };

    await router.receive(command, "c1");

    const threads = await store.list();
    expect(threads).toHaveLength(1);
    expect(threads[0].workspaceId).toBe("workspace-123");
  });

  it("resumes and immediately emits a thread snapshot without starting runtime", async () => {
    const publisher = new ThreadNotificationPublisher();
    const sent: ThreadNotification[] = [];
    publisher.attachConnection("c1", (event) => sent.push(event as ThreadNotification));
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    const Thread = await persistence.createThread();
    const orchestrator = {
      submitInput: vi.fn(async () => {}),
      isThreadRunning: vi.fn(() => false),
    };
    const router = new ThreadCommandRouter(
      orchestrator,
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
    );

    await router.receive(
      {
        type: "thread.resume",
        threadId: Thread.metadata.id,
        commandId: "c1",
        timestamp: "2026-06-04T00:00:00.000Z",
      },
      "c1",
    );

    expect(orchestrator.submitInput).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "thread.snapshot",
      threadId: Thread.metadata.id,
    });
  });

  it("forwards input.submit through orchestrator and publishes translated notifications", async () => {
    const publisher = new ThreadNotificationPublisher();
    const seen: string[] = [];
    publisher.attachConnection("c1", (event) => seen.push(event.type));
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    const Thread = await persistence.createThread();
    publisher.subscribe("c1", Thread.metadata.id);

    const orchestrator = {
      submitInput: vi.fn(async (_message, push: (message: ThreadNotification) => void) => {
        push({
          type: "user.message.recorded",
          threadId: Thread.metadata.id,
          notificationId: "event-user",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { messageId: "turn-1", text: "hi" },
        });
        push({
          type: "turn.started",
          threadId: Thread.metadata.id,
          notificationId: "event-turn",
          turnId: "turn-1",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: {},
        });
        push({
          type: "assistant.delta",
          threadId: Thread.metadata.id,
          notificationId: "event-assistant",
          turnId: "turn-1",
          itemId: "assistant-1",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { text: "hi" },
        });
        push({
          type: "tool.started",
          threadId: Thread.metadata.id,
          notificationId: "event-tool-start",
          turnId: "turn-1",
          itemId: "tool-1",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { name: "echo", input: { value: "x" } },
        });
        push({
          type: "tool.finished",
          threadId: Thread.metadata.id,
          notificationId: "event-tool-finish",
          turnId: "turn-1",
          itemId: "tool-1",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { name: "echo", output: "ok", status: "completed", durationMs: 0 },
        });
        push({
          type: "turn.completed",
          threadId: Thread.metadata.id,
          notificationId: "event-completed",
          turnId: "turn-1",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { status: "completed" },
        });
        push({
          type: "thread.status.changed",
          threadId: Thread.metadata.id,
          notificationId: "event-status",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { value: "idle" },
        });
      }),
    };
    const router = new ThreadCommandRouter(
      orchestrator,
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
    );

    await router.receive(
      {
        type: "input.submit",
        threadId: Thread.metadata.id,
        inputId: "input-1",
        timestamp: "2026-06-04T00:00:00.000Z",
        payload: { text: "hi" },
      },
      "c1",
    );

    expect(orchestrator.submitInput).toHaveBeenCalled();
    expect(seen).toEqual([
      "user.message.recorded",
      "turn.started",
      "assistant.delta",
      "tool.started",
      "tool.finished",
      "turn.completed",
      "thread.status.changed",
    ]);
  });

  it("maps input.submit inputId to the persisted user message id", async () => {
    const publisher = new ThreadNotificationPublisher();
    const seen: ThreadNotification[] = [];
    publisher.attachConnection("c1", (event) => seen.push(event as ThreadNotification));
    publisher.subscribe("c1", "thread-interrupt");
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-07T00:00:00.000Z",
    );
    const thread = await persistence.createThread();
    publisher.subscribe("c1", thread.metadata.id);
    const orchestrator = {
      submitInput: vi.fn(async (_message, push: (message: ThreadNotification) => void) => {
        push({
          type: "user.message.recorded",
          threadId: thread.metadata.id,
          notificationId: "recorded",
          timestamp: "2026-06-07T00:00:00.000Z",
          payload: { messageId: "input-1", text: "hi" },
        });
      }),
    };
    const router = new ThreadCommandRouter(
      orchestrator,
      persistence,
      publisher,
      () => "2026-06-07T00:00:00.000Z",
    );

    await router.receive(
      {
        type: "input.submit",
        threadId: thread.metadata.id,
        inputId: "input-1",
        timestamp: "2026-06-07T00:00:00.000Z",
        payload: { text: "hi" },
      },
      "c1",
    );

    expect(orchestrator.submitInput).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: thread.metadata.id,
        messageId: "input-1",
        payload: { text: "hi", attachments: undefined },
      }),
      expect.any(Function),
    );
    expect(seen).toEqual([
      expect.objectContaining({
        type: "user.message.recorded",
        threadId: thread.metadata.id,
      }),
    ]);
  });

  it("waits for interrupt cleanup when turn.interrupt is received", async () => {
    const publisher = new ThreadNotificationPublisher();
    const seen: ThreadNotification[] = [];
    publisher.attachConnection("c1", (event) => seen.push(event as ThreadNotification));
    publisher.subscribe("c1", "thread-interrupt");
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-07T00:00:00.000Z",
    );
    const orchestrator = {
      submitInput: vi.fn(async () => {}),
      interruptThread: vi.fn(),
      interruptAndWait: vi.fn(async (_threadId, push: (message: ThreadNotification) => void) => {
        push({
          type: "turn.completed",
          threadId: "thread-interrupt",
          notificationId: "interrupted",
          turnId: "turn-1",
          timestamp: "2026-06-07T00:00:00.000Z",
          payload: { status: "interrupted" },
        });
      }),
    };
    const router = new ThreadCommandRouter(
      orchestrator,
      persistence,
      publisher,
      () => "2026-06-07T00:00:00.000Z",
    );

    await router.receive(
      {
        type: "turn.interrupt",
        threadId: "thread-interrupt",
        commandId: "interrupt-1",
        timestamp: "2026-06-07T00:00:00.000Z",
      },
      "c1",
    );

    expect(orchestrator.interruptAndWait).toHaveBeenCalledWith(
      "thread-interrupt",
      expect.any(Function),
    );
    expect(orchestrator.interruptThread).not.toHaveBeenCalled();
    expect(seen).toEqual([
      expect.objectContaining({
        type: "turn.completed",
        threadId: "thread-interrupt",
      }),
    ]);
  });

  it("emits thread.error to the requesting connection when input.submit targets a missing thread", async () => {
    const publisher = new ThreadNotificationPublisher();
    const first: ThreadNotification[] = [];
    const second: ThreadNotification[] = [];
    publisher.attachConnection("c1", (event) => first.push(event as ThreadNotification));
    publisher.attachConnection("c2", (event) => second.push(event as ThreadNotification));
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    const orchestrator = {
      submitInput: vi.fn(async () => {}),
    };
    const router = new ThreadCommandRouter(
      orchestrator,
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
    );

    await router.receive(
      {
        type: "input.submit",
        threadId: "missing-thread",
        inputId: "input-1",
        timestamp: "2026-06-04T00:00:00.000Z",
        payload: { text: "hi" },
      },
      "c1",
    );

    expect(orchestrator.submitInput).not.toHaveBeenCalled();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      type: "thread.error",
      threadId: "missing-thread",
      payload: { code: "thread_not_found" },
    });
    expect(first[0]).not.toHaveProperty("commandId");
    expect(second).toEqual([]);
  });

  it("lists threads and emits thread.listed only to the requesting connection", async () => {
    const publisher = new ThreadNotificationPublisher();
    const first: string[] = [];
    const second: string[] = [];
    publisher.attachConnection("c1", (event) => first.push(event.type));
    publisher.attachConnection("c2", (event) => second.push(event.type));
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    await persistence.createThread();
    const router = new ThreadCommandRouter(
      { submitInput: vi.fn(async () => {}) },
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
    );

    await router.receive(
      {
        type: "thread.list",
        commandId: "list-1",
        timestamp: "2026-06-04T00:00:00.000Z",
      },
      "c1",
    );

    expect(first).toEqual(["thread.listed"]);
    expect(second).toEqual([]);
  });

  it("interrupts a running thread before deletion and emits thread.deleted", async () => {
    const publisher = new ThreadNotificationPublisher();
    const seen: string[] = [];
    publisher.attachConnection("c1", (event) => seen.push(event.type));
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    const Thread = await persistence.createThread();
    const orchestrator = {
      submitInput: vi.fn(async () => {}),
      isThreadRunning: vi.fn(() => true),
      interruptAndWait: vi.fn(async () => {}),
    };
    const onThreadDeleted = vi.fn();
    const router = new ThreadCommandRouter(
      orchestrator,
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
      undefined,
      onThreadDeleted,
    );

    await router.receive(
      {
        type: "thread.delete",
        commandId: "delete-1",
        timestamp: "2026-06-04T00:00:00.000Z",
        payload: { targetThreadId: Thread.metadata.id },
      },
      "c1",
    );

    expect(orchestrator.interruptAndWait).toHaveBeenCalled();
    expect(onThreadDeleted).toHaveBeenCalledWith(Thread.metadata.id);
    expect(seen).toEqual(["thread.deleted"]);
  });
});

function createCommand(): Extract<ThreadCommand, { type: "thread.start" }> {
  return {
    type: "thread.start",
    commandId: "create-1",
    timestamp: "2026-06-04T00:00:00.000Z",
    payload: {
      workspaceId: null,
      actionBinding: null,
    },
  };
}
