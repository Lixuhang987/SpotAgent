import { describe, expect, it, vi } from "vitest";
import { InMemoryThreadStore } from "@handagent/core/storage/index.ts";
import type { ThreadCommand, ThreadStartCommand, OpSubmitCommand } from "@handagent/core/protocol/ThreadCommand.ts";
import type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";
import { AgentManager, createSharedAgentStatus, type Agent } from "../../src/agent/AgentManager.ts";
import { ThreadPersistence } from "../../src/thread/ThreadPersistence.ts";
import { ThreadNotificationPublisher } from "../../src/thread/ThreadNotificationPublisher.ts";
import { ThreadCommandRouter } from "../../src/thread/ThreadCommandRouter.ts";

describe("ThreadCommandRouter", () => {
  it("creates a thread, registers an agent, and emits thread.started", async () => {
    const publisher = new ThreadNotificationPublisher();
    const sent: string[] = [];
    publisher.attachConnection("c1", (event) => sent.push(event.type));
    const manager = new AgentManager();
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    const createAgent = vi.fn((threadId: string) => makeAgent(threadId));
    const router = new ThreadCommandRouter(
      manager,
      persistence,
      publisher,
      () => "2026-06-04T00:00:00.000Z",
      undefined,
      undefined,
      {},
      undefined,
      createAgent,
    );

    await router.receive(createCommand(), "c1");

    const threads = await persistence.listThreads();
    expect(createAgent).toHaveBeenCalledWith(threads[0].id);
    expect(manager.has(threads[0].id)).toBe(true);
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
    const router = makeRouter({ persistence, publisher });

    await router.receive(
      {
        type: "thread.start",
        commandId: "create-ws-1",
        timestamp: "2026-06-04T00:00:00.000Z",
        payload: {
          workspaceId: "workspace-123",
          actionBinding: null,
        },
      },
      "c1",
    );

    const threads = await store.list();
    expect(threads).toHaveLength(1);
    expect(threads[0].workspaceId).toBe("workspace-123");
  });

  it("resumes and immediately emits a thread snapshot without submitting runtime input", async () => {
    const publisher = new ThreadNotificationPublisher();
    const sent: ThreadNotification[] = [];
    publisher.attachConnection("c1", (event) => sent.push(event as ThreadNotification));
    const manager = new AgentManager();
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    const thread = await persistence.createThread();
    const agent = makeAgent(thread.metadata.id);
    const submitSpy = vi.spyOn(agent.tx_sub, "send");
    manager.register(thread.metadata.id, agent);
    const router = makeRouter({ manager, persistence, publisher });

    await router.receive(
      {
        type: "thread.resume",
        threadId: thread.metadata.id,
        commandId: "c1",
        timestamp: "2026-06-04T00:00:00.000Z",
      },
      "c1",
    );

    expect(submitSpy).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "thread.snapshot",
      threadId: thread.metadata.id,
      payload: { status: "idle" },
    });
  });

  it("forwards op.submit user input to the registered agent", async () => {
    const publisher = new ThreadNotificationPublisher();
    const manager = new AgentManager();
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    const thread = await persistence.createThread();
    const sentOps: string[] = [];
    manager.register(thread.metadata.id, makeAgent(thread.metadata.id, async (op) => {
      sentOps.push(op.type);
    }));
    const router = makeRouter({ manager, persistence, publisher });

    await router.receive(userInputCommand(thread.metadata.id), "c1");

    expect(sentOps).toEqual(["user_input"]);
  });

  it("forwards op.submit interrupt to the registered agent", async () => {
    const manager = new AgentManager();
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-07T00:00:00.000Z",
    );
    const thread = await persistence.createThread();
    const sentOps: string[] = [];
    manager.register(thread.metadata.id, makeAgent(thread.metadata.id, async (op) => {
      sentOps.push(op.type);
    }));
    const router = makeRouter({ manager, persistence });

    await router.receive(
      {
        type: "op.submit",
        threadId: thread.metadata.id,
        commandId: "interrupt-1",
        timestamp: "2026-06-07T00:00:00.000Z",
        payload: {
          op: {
            type: "interrupt",
            opId: "interrupt-op-1",
            timestamp: "2026-06-07T00:00:00.000Z",
            payload: { reason: "user" },
          },
        },
      },
      "c1",
    );

    expect(sentOps).toEqual(["interrupt"]);
  });


  it("wraps client responses as ops and forwards them to the registered agent", async () => {
    const manager = new AgentManager();
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-11T00:00:00.000Z",
    );
    const thread = await persistence.createThread();
    const sentOps: string[] = [];
    manager.register(thread.metadata.id, makeAgent(thread.metadata.id, async (op) => {
      sentOps.push(`${op.type}:${op.opId}`);
    }));
    const router = makeRouter({ manager, persistence });

    await router.handleResponse(
      {
        type: "permission.answered",
        requestId: `${thread.metadata.id}:permission-1`,
        timestamp: "2026-06-11T00:00:00.000Z",
        payload: { decision: "allow", scope: "thread" },
      },
      "c1",
    );

    expect(sentOps).toEqual([`client_response:${thread.metadata.id}:permission-1`]);
  });

  it("emits thread.error to the requesting connection when op.submit targets a missing thread", async () => {
    const publisher = new ThreadNotificationPublisher();
    const first: ThreadNotification[] = [];
    const second: ThreadNotification[] = [];
    publisher.attachConnection("c1", (event) => first.push(event as ThreadNotification));
    publisher.attachConnection("c2", (event) => second.push(event as ThreadNotification));
    const router = makeRouter({ publisher });

    await router.receive(userInputCommand("missing-thread"), "c1");

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      type: "thread.error",
      threadId: "missing-thread",
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
    const router = makeRouter({ persistence, publisher });

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

  it("closes the agent before deletion and emits thread.deleted", async () => {
    const publisher = new ThreadNotificationPublisher();
    const seen: string[] = [];
    publisher.attachConnection("c1", (event) => seen.push(event.type));
    const manager = new AgentManager();
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-06-04T00:00:00.000Z",
    );
    const thread = await persistence.createThread();
    const close = vi.fn(async () => {});
    manager.register(thread.metadata.id, { ...makeAgent(thread.metadata.id), close });
    const onThreadDeleted = vi.fn();
    const router = makeRouter({ manager, persistence, publisher, onThreadDeleted });

    await router.receive(
      {
        type: "thread.delete",
        commandId: "delete-1",
        timestamp: "2026-06-04T00:00:00.000Z",
        payload: { targetThreadId: thread.metadata.id },
      },
      "c1",
    );

    expect(close).toHaveBeenCalled();
    expect(manager.has(thread.metadata.id)).toBe(false);
    expect(onThreadDeleted).toHaveBeenCalledWith(thread.metadata.id);
    expect(seen).toEqual(["thread.deleted"]);
  });
});

function makeRouter({
  manager = new AgentManager(),
  persistence = new ThreadPersistence(
    new InMemoryThreadStore(),
    () => "2026-06-04T00:00:00.000Z",
  ),
  publisher = new ThreadNotificationPublisher(),
  onThreadDeleted,
}: {
  manager?: AgentManager;
  persistence?: ThreadPersistence;
  publisher?: ThreadNotificationPublisher;
  onThreadDeleted?: (threadId: string) => void;
} = {}): ThreadCommandRouter {
  return new ThreadCommandRouter(
    manager,
    persistence,
    publisher,
    () => "2026-06-04T00:00:00.000Z",
    undefined,
    onThreadDeleted,
    {},
    undefined,
    (threadId) => makeAgent(threadId),
  );
}

function makeAgent(
  threadId: string,
  send: Agent["tx_sub"]["send"] = async () => {},
): Agent {
  return {
    tx_sub: { send },
    rx_event: (async function* emptyRuntimeEventStream() {})(),
    agent_status: createSharedAgentStatus(),
    session: { threadId },
    close: vi.fn(async () => {}),
  };
}

function createCommand(): ThreadStartCommand {
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

function userInputCommand(threadId: string): OpSubmitCommand {
  return {
    type: "op.submit",
    threadId,
    commandId: "op-command-1",
    timestamp: "2026-06-04T00:00:00.000Z",
    payload: {
      op: {
        type: "user_input",
        opId: "op-1",
        timestamp: "2026-06-04T00:00:00.000Z",
        payload: {
          items: [{ type: "text", id: "item-1", text: "hello" }],
        },
      },
    },
  };
}
