import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent } from "../../../packages/core/src/runtime/AgentRuntime.ts";
import type { SessionMessage, UserMessageAttachment } from "../../../packages/core/src/protocol/SessionMessage.ts";
import type { ConversationMessage } from "../../../packages/core/src/conversation/ConversationMessage.ts";
import type { SessionEvent } from "../../../packages/core/src/storage/index.ts";
import type { BlobStore } from "../../../packages/core/src/blob/BlobStore.ts";
import { parseStub, renderStub } from "../../../packages/core/src/runtime/Stub.ts";

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

export function agentMessagesToRuntimeMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.map((message) => {
    if (message.role !== "user" || typeof message.content !== "string") {
      return message;
    }

    const content = parseRuntimeUserContent(message.content);
    if (typeof content === "string") {
      return message;
    }
    return {
      ...message,
      content,
    };
  });
}

export async function composeUserContent(
  text: string,
  attachments: UserMessageAttachment[] | undefined,
  blobStore: BlobStore,
): Promise<string> {
  if (!attachments || attachments.length === 0) return text;
  const parts: string[] = [text];
  for (const attachment of attachments) {
    if (attachment.kind === "text_selection") {
      parts.push(`[选区]\n${attachment.text}`);
    } else if (attachment.kind === "image") {
      const record = await blobStore.put({
        kind: "image",
        bytes: Buffer.from(attachment.base64, "base64"),
        extension: imageExtension(attachment.mimeType),
      });
      parts.push(renderStub({
        id: record.id,
        kind: record.kind,
        size: record.size,
        path: record.path,
      }));
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

function parseRuntimeUserContent(content: string): Extract<AgentMessage, { role: "user" }>["content"] {
  const stubPattern = /\[STUB [^\]]*\]\n[\s\S]*?\n?\[\/STUB\]/g;
  const parts: Exclude<Extract<AgentMessage, { role: "user" }>["content"], string> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = stubPattern.exec(content)) !== null) {
    appendTextPart(parts, content.slice(cursor, match.index));
    const stubText = match[0];
    try {
      const stub = parseStub(stubText);
      if (stub.kind === "image") {
        const mimeType = mimeTypeForPath(stub.path);
        if (mimeType) {
          parts.push({ type: "image", blobId: stub.id, mimeType });
        } else {
          appendTextPart(parts, stubText);
        }
      } else {
        appendTextPart(parts, stubText);
      }
    } catch {
      appendTextPart(parts, stubText);
    }
    cursor = match.index + stubText.length;
  }

  appendTextPart(parts, content.slice(cursor));
  if (!parts.some((part) => part.type === "image")) {
    return content;
  }
  return parts;
}

function appendTextPart(
  parts: Exclude<Extract<AgentMessage, { role: "user" }>["content"], string>,
  text: string,
): void {
  const normalized = text.trim();
  if (!normalized) return;
  parts.push({ type: "text", text: normalized });
}

function mimeTypeForPath(path: string): "image/png" | "image/jpeg" | "image/webp" | undefined {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return undefined;
}

function imageExtension(mimeType: Extract<UserMessageAttachment, { kind: "image" }>["mimeType"]): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}
