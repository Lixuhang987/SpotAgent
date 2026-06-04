import { describe, expect, it, vi } from "vitest";
import { InMemorySessionStore } from "@handagent/core/storage/index.ts";
import type { SessionMessage } from "@handagent/core/protocol/SessionMessage.ts";
import type { SessionCommand } from "@handagent/core/protocol/SessionCommand.ts";
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
    const sent: SessionMessage[] = [];
    publisher.attachConnection("c1", (event) => sent.push(event as never));
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
      handleUserMessage: vi.fn(async (_message, push: (message: SessionMessage) => void) => {
        push({
          type: "assistant_message_delta",
          sessionId: session.metadata.id,
          messageId: "assistant-1",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { text: "hi" },
        });
        push({
          type: "tool_message",
          sessionId: session.metadata.id,
          messageId: "tool-1",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { name: "echo", text: "{\"value\":\"x\"}", status: "running" },
        });
        push({
          type: "tool_message",
          sessionId: session.metadata.id,
          messageId: "tool-1",
          timestamp: "2026-06-04T00:00:00.000Z",
          payload: { name: "echo", text: "ok", status: "completed" },
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
