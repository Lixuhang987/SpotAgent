import { describe, expect, it, vi } from "vitest";
import { InMemorySessionStore } from "@handagent/core/storage/index.ts";
import type { SessionCommand } from "@handagent/core/protocol/SessionCommand.ts";
import type { SessionEvent } from "@handagent/core/protocol/SessionEvent.ts";
import { SessionPersistence } from "../../src/session/SessionPersistence.ts";
import { SessionEventPublisher } from "../../src/session/SessionEventPublisher.ts";
import { SessionCommandRouter } from "../../src/session/SessionCommandRouter.ts";

describe("SessionCommandRouter", () => {
  it("creates a session and emits session_created to the issuing connection", async () => {
    const publisher = new SessionEventPublisher();
    const sent: string[] = [];
    publisher.attachConnection("c1", (event) => sent.push(event.type));
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    const router = new SessionCommandRouter(
      { handleUserMessage: vi.fn(async () => {}) },
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
    );

    await router.receive(createCommand(), "c1");

    expect(sent).toEqual(["session_created"]);
  });

  it("subscribes and immediately emits a snapshot without starting runtime", async () => {
    const publisher = new SessionEventPublisher();
    const sent: SessionEvent[] = [];
    publisher.attachConnection("c1", (event) => sent.push(event as SessionEvent));
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    const session = await persistence.createSession();
    const orchestrator = {
      handleUserMessage: vi.fn(async () => {}),
      isSessionRunning: vi.fn(() => false),
    };
    const router = new SessionCommandRouter(
      orchestrator,
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
    );

    await router.receive(
      {
        type: "session_subscribe",
        sessionId: session.metadata.id,
        commandId: "c1",
        timestamp: "2026-06-04T00:00:00.000Z",
        payload: {},
      },
      "c1",
    );

    expect(orchestrator.handleUserMessage).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "session_snapshot",
      sessionId: session.metadata.id,
    });
  });

  it("forwards turn_start through orchestrator and publishes translated events", async () => {
    const publisher = new SessionEventPublisher();
    const seen: string[] = [];
    publisher.attachConnection("c1", (event) => seen.push(event.type));
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    const session = await persistence.createSession();
    publisher.subscribe("c1", session.metadata.id);

    const orchestrator = {
      handleUserMessage: vi.fn(async (_message, push: (message: SessionEvent) => void) => {
        push({
          type: "user_message_recorded",
          sessionId: session.metadata.id,
          eventId: "event-user",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { messageId: "turn-1", text: "hi" },
        });
        push({
          type: "turn_started",
          sessionId: session.metadata.id,
          eventId: "event-turn",
          turnId: "turn-1",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: {},
        });
        push({
          type: "assistant_delta",
          sessionId: session.metadata.id,
          eventId: "event-assistant",
          turnId: "turn-1",
          itemId: "assistant-1",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { text: "hi" },
        });
        push({
          type: "tool_started",
          sessionId: session.metadata.id,
          eventId: "event-tool-start",
          turnId: "turn-1",
          itemId: "tool-1",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { name: "echo", input: { value: "x" } },
        });
        push({
          type: "tool_finished",
          sessionId: session.metadata.id,
          eventId: "event-tool-finish",
          turnId: "turn-1",
          itemId: "tool-1",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { name: "echo", output: "ok", status: "completed", durationMs: 0 },
        });
        push({
          type: "turn_completed",
          sessionId: session.metadata.id,
          eventId: "event-completed",
          turnId: "turn-1",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { status: "completed" },
        });
        push({
          type: "session_status_changed",
          sessionId: session.metadata.id,
          eventId: "event-status",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { value: "idle" },
        });
      }),
    };
    const router = new SessionCommandRouter(
      orchestrator,
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
    );

    await router.receive(
      {
        type: "turn_start",
        sessionId: session.metadata.id,
        commandId: "turn-1",
        timestamp: "2026-06-04T00:00:00.000Z",
        payload: { text: "hi" },
      },
      "c1",
    );

    expect(orchestrator.handleUserMessage).toHaveBeenCalled();
    expect(seen).toEqual([
      "user_message_recorded",
      "turn_started",
      "assistant_delta",
      "tool_started",
      "tool_finished",
      "turn_completed",
      "session_status_changed",
    ]);
  });

  it("lists sessions and emits sessions_listed only to the requesting connection", async () => {
    const publisher = new SessionEventPublisher();
    const first: string[] = [];
    const second: string[] = [];
    publisher.attachConnection("c1", (event) => first.push(event.type));
    publisher.attachConnection("c2", (event) => second.push(event.type));
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    await persistence.createSession();
    const router = new SessionCommandRouter(
      { handleUserMessage: vi.fn(async () => {}) },
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
    );

    await router.receive(
      {
        type: "sessions_list",
        commandId: "list-1",
        timestamp: "2026-06-04T00:00:00.000Z",
        payload: {},
      },
      "c1",
    );

    expect(first).toEqual(["sessions_listed"]);
    expect(second).toEqual([]);
  });

  it("interrupts a running session before deletion and emits session_deleted", async () => {
    const publisher = new SessionEventPublisher();
    const seen: string[] = [];
    publisher.attachConnection("c1", (event) => seen.push(event.type));
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    const session = await persistence.createSession();
    const orchestrator = {
      handleUserMessage: vi.fn(async () => {}),
      isSessionRunning: vi.fn(() => true),
      interruptAndWait: vi.fn(async () => {}),
    };
    const onSessionDeleted = vi.fn();
    const router = new SessionCommandRouter(
      orchestrator,
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
      undefined,
      onSessionDeleted,
    );

    await router.receive(
      {
        type: "session_delete",
        commandId: "delete-1",
        timestamp: "2026-06-04T00:00:00.000Z",
        payload: { targetSessionId: session.metadata.id },
      },
      "c1",
    );

    expect(orchestrator.interruptAndWait).toHaveBeenCalled();
    expect(onSessionDeleted).toHaveBeenCalledWith(session.metadata.id);
    expect(seen).toEqual(["session_deleted"]);
  });
});

function createCommand(): Extract<SessionCommand, { type: "session_create" }> {
  return {
    type: "session_create",
    commandId: "create-1",
    timestamp: "2026-06-04T00:00:00.000Z",
    payload: {},
  };
}
