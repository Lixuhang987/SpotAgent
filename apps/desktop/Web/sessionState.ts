import type { BubbleItem } from "./BubbleList";
import type { ConversationMessage } from "../../../packages/core/src/conversation/ConversationMessage.ts";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage.ts";

export type ConversationState = {
  sessionId: string;
  messages: ConversationMessage[];
  status: "idle" | "running" | "failed";
  error: string | null;
};

export function createEmptyConversationState(sessionId: string): ConversationState {
  return {
    sessionId,
    messages: [],
    status: "idle",
    error: null,
  };
}

export function reduceSessionMessage(
  state: ConversationState,
  message: SessionMessage,
): ConversationState {
  if (message.sessionId !== state.sessionId) {
    return state;
  }

  if (message.type === "open_session") {
    return createEmptyConversationState(message.sessionId);
  }

  if (message.type === "session_snapshot") {
    return {
      sessionId: message.sessionId,
      messages: message.payload.messages,
      status: message.payload.status,
      error: null,
    };
  }

  if (message.type === "user_message") {
    return {
      ...state,
      status: "running",
      error: null,
      messages: [
        ...state.messages,
        {
          id: message.messageId,
          role: "user",
          text: message.payload.text,
          status: "completed",
          createdAt: message.timestamp,
          updatedAt: message.timestamp,
        },
      ],
    };
  }

  if (message.type === "assistant_message_start") {
    return {
      ...state,
      status: "running",
      error: null,
      messages: [
        ...state.messages,
        {
          id: message.messageId,
          role: "assistant",
          text: "",
          status: "streaming",
          createdAt: message.timestamp,
          updatedAt: message.timestamp,
        },
      ],
    };
  }

  if (message.type === "assistant_message_delta") {
    return {
      ...state,
      messages: state.messages.map((item) =>
        item.id === message.messageId
          ? {
              ...item,
              text: `${item.text}${message.payload.text}`,
              updatedAt: message.timestamp,
            }
          : item,
      ),
    };
  }

  if (message.type === "assistant_message_end") {
    return {
      ...state,
      messages: state.messages.map((item) =>
        item.id === message.messageId
          ? {
              ...item,
              status: message.payload.status,
              updatedAt: message.timestamp,
            }
          : item,
      ),
      status: message.payload.status === "completed" ? "idle" : state.status,
    };
  }

  if (message.type === "tool_message") {
    return {
      ...state,
      messages: [
        ...state.messages,
        {
          id: message.messageId,
          role: "tool",
          text: message.payload.text,
          status: message.payload.status,
          createdAt: message.timestamp,
          updatedAt: message.timestamp,
          toolCall: {
            name: message.payload.name,
          },
        },
      ],
    };
  }

  if (message.type === "status") {
    return {
      ...state,
      status: message.payload.value,
      error: null,
    };
  }

  if (message.type === "error") {
    return {
      ...state,
      status: "failed",
      error: message.payload.message,
    };
  }

  return state;
}

export function toBubbleItems(state: ConversationState): BubbleItem[] {
  return state.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-6)
    .map((message) => ({
      id: message.id,
      text: message.text,
      kind: message.role === "user" ? "user" : "assistant",
    }));
}
