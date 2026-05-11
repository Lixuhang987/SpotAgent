import { describe, expect, it } from "vitest";
import {
  createEmptyConversationState,
  reduceSessionMessage,
  toBubbleItems,
} from "../Web/sessionState";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage";

describe("sessionState reducer", () => {
  it("resets local state from a session snapshot", () => {
    const snapshot: SessionMessage = {
      type: "session_snapshot",
      sessionId: "s1",
      messageId: "snapshot-1",
      timestamp: "2026-05-11T00:00:00.300Z",
      payload: {
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            text: "来自服务端的完整状态",
            status: "completed",
            createdAt: "2026-05-11T00:00:00.000Z",
            updatedAt: "2026-05-11T00:00:00.200Z",
          },
        ],
        status: "idle",
      },
    };

    const state = reduceSessionMessage(
      {
        ...createEmptyConversationState("s1"),
        messages: [
          {
            id: "local-1",
            role: "user",
            text: "旧状态",
            status: "completed",
            createdAt: "2026-05-11T00:00:00.000Z",
            updatedAt: "2026-05-11T00:00:00.000Z",
          },
        ],
        status: "running",
        error: "old error",
      },
      snapshot,
    );

    expect(state.messages).toEqual(snapshot.payload.messages);
    expect(state.status).toBe("idle");
    expect(state.error).toBeNull();
  });

  it("merges assistant deltas into one assistant message", () => {
    const start: SessionMessage = {
      type: "assistant_message_start",
      sessionId: "s1",
      messageId: "m1",
      timestamp: "2026-05-11T00:00:00.000Z",
      payload: { role: "assistant" },
    };
    const deltaA: SessionMessage = {
      type: "assistant_message_delta",
      sessionId: "s1",
      messageId: "m1",
      timestamp: "2026-05-11T00:00:00.100Z",
      payload: { text: "你" },
    };
    const deltaB: SessionMessage = {
      type: "assistant_message_delta",
      sessionId: "s1",
      messageId: "m1",
      timestamp: "2026-05-11T00:00:00.200Z",
      payload: { text: "好" },
    };

    let state = createEmptyConversationState("s1");
    state = reduceSessionMessage(state, start);
    state = reduceSessionMessage(state, deltaA);
    state = reduceSessionMessage(state, deltaB);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.text).toBe("你好");
  });

  it("ignores messages from a different session", () => {
    const start: SessionMessage = {
      type: "assistant_message_start",
      sessionId: "s2",
      messageId: "m1",
      timestamp: "2026-05-11T00:00:00.000Z",
      payload: { role: "assistant" },
    };

    const state = reduceSessionMessage(createEmptyConversationState("s1"), start);

    expect(state.messages).toHaveLength(0);
  });

  it("updates tool messages and status messages", () => {
    const tool: SessionMessage = {
      type: "tool_message",
      sessionId: "s1",
      messageId: "tool-1",
      timestamp: "2026-05-11T00:00:00.000Z",
      payload: {
        name: "file.read",
        text: "done",
        status: "running",
      },
    };
    const status: SessionMessage = {
      type: "status",
      sessionId: "s1",
      messageId: "status-1",
      timestamp: "2026-05-11T00:00:00.100Z",
      payload: { value: "failed" },
    };

    const state = reduceSessionMessage(
      reduceSessionMessage(createEmptyConversationState("s1"), tool),
      status,
    );

    expect(state.messages).toEqual([
      {
        id: "tool-1",
        role: "tool",
        text: "done",
        status: "running",
        createdAt: "2026-05-11T00:00:00.000Z",
        updatedAt: "2026-05-11T00:00:00.000Z",
        toolCall: {
          name: "file.read",
        },
      },
    ]);
    expect(state.status).toBe("failed");
  });

  it("resets state on open session", () => {
    const state = reduceSessionMessage(
      {
        ...createEmptyConversationState("old"),
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            text: "old",
            status: "completed",
            createdAt: "2026-05-11T00:00:00.000Z",
            updatedAt: "2026-05-11T00:00:00.000Z",
          },
        ],
        status: "failed",
        error: "broken",
      },
      {
        type: "open_session",
        sessionId: "old",
        messageId: "open-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: {},
      },
    );

    expect(state).toEqual(createEmptyConversationState("old"));
  });

  it("keeps only the latest six bubbles", () => {
    const state = {
      ...createEmptyConversationState("s1"),
      messages: Array.from({ length: 7 }, (_, index) => ({
        id: `user-${index + 1}`,
        role: "user" as const,
        text: `消息 ${index + 1}`,
        status: "completed" as const,
        createdAt: "2026-05-11T00:00:00.000Z",
        updatedAt: "2026-05-11T00:00:00.000Z",
      })),
    };

    expect(toBubbleItems(state)).toHaveLength(6);
    expect(toBubbleItems(state)[0]?.text).toBe("消息 2");
  });
});
