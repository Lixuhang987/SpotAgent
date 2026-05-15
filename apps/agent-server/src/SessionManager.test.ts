import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent } from "../../../packages/core/src/runtime/AgentRuntime.ts";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage.ts";
import { SessionManager } from "./SessionManager.ts";
import { InMemorySessionStore } from "./SessionStore.ts";
import { handleSocketMessage } from "./server.ts";

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

describe("SessionManager", () => {
  it("lists sessions and returns history through the store abstraction", () => {
    const store = new InMemorySessionStore();
    store.save({
      sessionId: "session-1",
      messages: [{ role: "user", content: "hello" }],
      updatedAt: "2026-05-14T00:00:00.000Z",
    });

    expect(store.listSessions()).toEqual([
      {
        sessionId: "session-1",
        updatedAt: "2026-05-14T00:00:00.000Z",
      },
    ]);
    expect(store.getSessionHistory("session-1")).toEqual([
      { role: "user", content: "hello" },
    ]);
  });

  it("exposes stored session history through SessionManager", async () => {
    const store = new InMemorySessionStore();
    const manager = new SessionManager(
      {
        async runWithMessages(messages: AgentMessage[]) {
          return {
            messages,
            bubbles: [],
          };
        },
      },
      () => {},
      {
        now: () => "2026-05-14T00:00:00.000Z",
        store,
      },
    );

    await manager.receive(createUserMessage("session-store", "hello", "user-1"));

    expect(manager.listSessions()).toEqual([
      {
        sessionId: "session-store",
        updatedAt: "2026-05-14T00:00:00.000Z",
      },
    ]);
    expect(manager.getSessionHistory("session-store")).toEqual([
      {
        role: "user",
        content: "hello",
      },
    ]);
  });

  it("pushes assistant delta events and persists final user + assistant messages", async () => {
    const pushed: SessionMessage[] = [];
    const runtimeCalls: AgentMessage[][] = [];
    const runtime = {
      async runWithMessages(
        messages: AgentMessage[],
        onEvent: (event: AgentRuntimeEvent) => void,
      ) {
        runtimeCalls.push(messages.map((message) => ({ ...message })));
        onEvent({
          type: "assistant_message_start",
          messageId: "assistant-1",
          payload: { role: "assistant" },
        });
        onEvent({
          type: "assistant_message_delta",
          messageId: "assistant-1",
          payload: { text: "你好，我收到了。" },
        });
        onEvent({
          type: "assistant_message_end",
          messageId: "assistant-1",
          payload: { status: "completed" },
        });

        return {
          messages: [
            ...messages,
            {
              role: "assistant" as const,
              content: "你好，我收到了。",
            },
          ],
          bubbles: [],
        };
      },
    };

    const manager = new SessionManager(
      runtime,
      (message) => {
        pushed.push(message);
      },
      {
        now: () => "2026-05-11T00:00:00.000Z",
      },
    );

    await manager.receive(createUserMessage("session-1", "第一句", "user-1"));

    expect(runtimeCalls).toEqual([
      [
        {
          role: "user",
          content: "第一句",
        },
      ],
    ]);
    expect(pushed).toEqual([
      {
        type: "assistant_message_start",
        sessionId: "session-1",
        messageId: "session-1-assistant-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: { role: "assistant" },
      },
      {
        type: "assistant_message_delta",
        sessionId: "session-1",
        messageId: "session-1-assistant-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: { text: "你好，我收到了。" },
      },
      {
        type: "assistant_message_end",
        sessionId: "session-1",
        messageId: "session-1-assistant-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: { status: "completed" },
      },
    ]);
    expect(manager.getSessionMessages("session-1")).toEqual([
      {
        role: "user",
        content: "第一句",
      },
      {
        role: "assistant",
        content: "你好，我收到了。",
      },
    ]);
  });

  it("passes the current session history back into runtime on later turns", async () => {
    const runtimeCalls: AgentMessage[][] = [];
    const replies = ["第一轮回复", "第二轮回复"];
    const runtime = {
      async runWithMessages(
        messages: AgentMessage[],
        onEvent: (event: AgentRuntimeEvent) => void,
      ) {
        runtimeCalls.push(messages.map((message) => ({ ...message })));
        const reply = replies[runtimeCalls.length - 1];
        onEvent({
          type: "assistant_message_start",
          messageId: "assistant-1",
          payload: { role: "assistant" },
        });
        onEvent({
          type: "assistant_message_delta",
          messageId: "assistant-1",
          payload: { text: reply },
        });
        onEvent({
          type: "assistant_message_end",
          messageId: "assistant-1",
          payload: { status: "completed" },
        });

        return {
          messages: [
            ...messages,
            {
              role: "assistant" as const,
              content: reply,
            },
          ],
          bubbles: [],
        };
      },
    };

    const manager = new SessionManager(runtime, () => {}, {
      now: () => "2026-05-11T00:00:00.000Z",
    });

    await manager.receive(createUserMessage("session-2", "第一句", "user-1"));
    await manager.receive(createUserMessage("session-2", "第二句", "user-2"));

    expect(runtimeCalls).toEqual([
      [
        {
          role: "user",
          content: "第一句",
        },
      ],
      [
        {
          role: "user",
          content: "第一句",
        },
        {
          role: "assistant",
          content: "第一轮回复",
        },
        {
          role: "user",
          content: "第二句",
        },
      ],
    ]);
  });

  it("forwards websocket messages through SessionManager and sends outgoing JSON", async () => {
    const sent: string[] = [];
    const manager = new SessionManager(
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
      () => {},
      {
        now: () => "2026-05-11T00:00:00.000Z",
      },
    );

    await handleSocketMessage(
      manager,
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

  it("pushes an error message when runtime execution fails", async () => {
    const pushed: SessionMessage[] = [];
    const manager = new SessionManager(
      {
        async runWithMessages() {
          throw new Error("Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。");
        },
      },
      (message) => {
        pushed.push(message);
      },
      {
        now: () => "2026-05-11T00:00:00.000Z",
      },
    );

    await manager.receive(createUserMessage("session-4", "你好", "user-1"));

    expect(pushed).toEqual([
      {
        type: "error",
        sessionId: "session-4",
        messageId: "session-4-error",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: {
          message: "Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。",
        },
      },
    ]);
    expect(manager.getSessionMessages("session-4")).toEqual([
      {
        role: "user",
        content: "你好",
      },
    ]);
  });
});
