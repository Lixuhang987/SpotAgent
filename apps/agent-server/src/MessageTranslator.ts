import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent } from "../../../packages/core/src/runtime/AgentRuntime.ts";
import type { SessionMessage, UserMessageAttachment } from "../../../packages/core/src/protocol/SessionMessage.ts";
import type { ConversationMessage } from "../../../packages/core/src/conversation/ConversationMessage.ts";
import type { SessionEvent } from "../../../packages/core/src/storage/index.ts";

export function toSessionMessage(
  sessionId: string,
  event: AgentRuntimeEvent,
  timestamp: string,
):
  | Extract<
      SessionMessage,
      | { type: "assistant_message_start" }
      | { type: "assistant_message_delta" }
      | { type: "assistant_message_end" }
      | { type: "tool_message" }
    >
  | null {
  switch (event.type) {
    case "assistant_message_start":
      return {
        type: "assistant_message_start",
        sessionId,
        messageId: `${sessionId}-${event.messageId}`,
        timestamp,
        payload: event.payload,
      };
    case "assistant_message_delta":
      return {
        type: "assistant_message_delta",
        sessionId,
        messageId: `${sessionId}-${event.messageId}`,
        timestamp,
        payload: event.payload,
      };
    case "assistant_message_end":
      return {
        type: "assistant_message_end",
        sessionId,
        messageId: `${sessionId}-${event.messageId}`,
        timestamp,
        payload: event.payload,
      };
    case "tool_call":
      return {
        type: "tool_message",
        sessionId,
        messageId: `${sessionId}-${event.toolCallId}`,
        timestamp,
        payload: {
          name: event.toolName,
          text: stringifyToolInput(event.input),
          status: "running",
        },
      };
    case "tool_result":
      return {
        type: "tool_message",
        sessionId,
        messageId: `${sessionId}-${event.toolCallId}`,
        timestamp,
        payload: {
          name: event.toolName,
          text: event.output,
          status: event.status === "success" ? "completed" : "failed",
        },
      };
    case "permission_decision":
    case "runtime_error":
      return null;
  }
}

export function toAuditEvent(event: AgentRuntimeEvent, timestamp: string): SessionEvent | null {
  switch (event.type) {
    case "tool_call":
      return {
        type: "tool_call",
        timestamp,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.input,
      };
    case "tool_result":
      return {
        type: "tool_result",
        timestamp,
        toolCallId: event.toolCallId,
        status: event.status,
        output: event.output,
        durationMs: event.durationMs,
      };
    case "permission_decision":
      return {
        type: "permission_request",
        timestamp,
        toolName: event.toolName,
        action: event.decision,
        granted: event.decision === "allow",
      };
    case "runtime_error":
      return {
        type: "error",
        timestamp,
        message: event.message,
        code: event.code,
      };
    default:
      return null;
  }
}

export function agentMessagesToConversation(messages: AgentMessage[]): ConversationMessage[] {
  return messages.map((msg, idx) => {
    const id = `msg-${idx}`;
    const now = new Date(0).toISOString();
    if (msg.role === "tool") {
      return {
        id,
        role: "tool",
        text: msg.content,
        status: "completed",
        createdAt: now,
        updatedAt: now,
        toolCall: { name: msg.name },
      };
    }
    return {
      id,
      role: msg.role,
      text: typeof msg.content === "string" ? msg.content : "",
      status: "completed",
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function composeUserContent(
  text: string,
  attachments: UserMessageAttachment[] | undefined,
): string {
  if (!attachments || attachments.length === 0) return text;
  const parts: string[] = [text];
  for (const attachment of attachments) {
    if (attachment.kind === "text_selection") {
      parts.push(`[选区]\n${attachment.text}`);
    } else if (attachment.kind === "image") {
      parts.push(`[图片附件: ${attachment.mimeType} (${attachment.id})]`);
    }
  }
  return parts.join("\n\n");
}

export function deriveTitle(text: string): string {
  const trimmed = text.trim().replace(/\n.*/s, "");
  if (trimmed.length <= 50) return trimmed;
  return trimmed.slice(0, 47) + "...";
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Agent runtime failed.";
}

function stringifyToolInput(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input);
  } catch {
    return "";
  }
}
