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
      { handleUserMessage: vi.fn(async () => {}) },
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
    );

    await router.receive(createCommand(), "c1");

    expect(sent).toEqual(["thread.started"]);
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
      handleUserMessage: vi.fn(async () => {}),
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

    expect(orchestrator.handleUserMessage).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "thread.snapshot",
      threadId: Thread.metadata.id,
    });
  });

  it("forwards turn.start through orchestrator and publishes translated notifications", async () => {
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
      handleUserMessage: vi.fn(async (_message, push: (message: ThreadNotification) => void) => {
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
        type: "turn.start",
        threadId: Thread.metadata.id,
        commandId: "turn-1",
        timestamp: "2026-06-04T00:00:00.000Z",
        payload: { text: "hi" },
      },
      "c1",
    );

    expect(orchestrator.handleUserMessage).toHaveBeenCalled();
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

  it("keeps old turn.start compatible with async backend input handling", async () => {
    const publisher = new ThreadNotificationPublisher();
    const seen: ThreadNotification[] = [];
    publisher.attachConnection("c1", (event) => seen.push(event as ThreadNotification));
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-07T00:00:00.000Z",
    );
    const thread = await persistence.createThread();
    publisher.subscribe("c1", thread.metadata.id);
    const orchestrator = {
      handleUserMessage: vi.fn(async (_message, push: (message: ThreadNotification) => void) => {
        push({
          type: "user.message.recorded",
          threadId: thread.metadata.id,
          notificationId: "recorded",
          timestamp: "2026-06-07T00:00:00.000Z",
          payload: { messageId: "turn-1", text: "hi" },
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
        type: "turn.start",
        threadId: thread.metadata.id,
        commandId: "turn-1",
        timestamp: "2026-06-07T00:00:00.000Z",
        payload: { text: "hi" },
      },
      "c1",
    );

    expect(orchestrator.handleUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: thread.metadata.id,
        messageId: "turn-1",
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

  it("emits thread.error to the requesting connection when turn.start targets a missing thread", async () => {
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
      handleUserMessage: vi.fn(async () => {}),
    };
    const router = new ThreadCommandRouter(
      orchestrator,
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
    );

    await router.receive(
      {
        type: "turn.start",
        threadId: "missing-thread",
        commandId: "turn-1",
        timestamp: "2026-06-04T00:00:00.000Z",
        payload: { text: "hi" },
      },
      "c1",
    );

    expect(orchestrator.handleUserMessage).not.toHaveBeenCalled();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      type: "thread.error",
      threadId: "missing-thread",
      commandId: "turn-1",
      payload: { code: "thread_not_found" },
    });
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
      { handleUserMessage: vi.fn(async () => {}) },
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
      handleUserMessage: vi.fn(async () => {}),
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
