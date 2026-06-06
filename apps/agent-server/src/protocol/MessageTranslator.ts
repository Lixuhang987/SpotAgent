import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent } from "@handagent/core/runtime/AgentRuntime.ts";
import type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";
import type { ThreadAttachment } from "@handagent/core/protocol/ThreadProtocolShared.ts";
import type { ConversationMessage } from "@handagent/core/conversation/ConversationMessage.ts";
import type { ThreadAuditEvent } from "@handagent/core/storage/index.ts";
import type { BlobStore } from "@handagent/core/blob/BlobStore.ts";
import { parseStub, renderStub } from "@handagent/core/runtime/Stub.ts";

export function toThreadNotification(
  threadId: string,
  turnId: string,
  event: AgentRuntimeEvent,
  timestamp: string,
):
  | Extract<
      ThreadNotification,
      | { type: "assistant.delta" }
      | { type: "tool.started" }
      | { type: "tool.finished" }
      | { type: "thread.error" }
    >
  | null {
  switch (event.type) {
    case "assistant_message_delta":
      return {
        type: "assistant.delta",
        threadId,
        notificationId: `${threadId}-${event.messageId}-${timestamp}-delta`,
        turnId,
        itemId: `${threadId}-${turnId}-${event.messageId}`,
        timestamp,
        payload: { text: event.payload.text },
      };
    case "tool_call":
      return {
        type: "tool.started",
        threadId,
        notificationId: `${threadId}-${event.toolCallId}-${timestamp}-start`,
        turnId,
        itemId: `${threadId}-${event.toolCallId}`,
        timestamp,
        payload: {
          name: event.toolName,
          input: event.input,
        },
      };
    case "tool_result":
      return {
        type: "tool.finished",
        threadId,
        notificationId: `${threadId}-${event.toolCallId}-${timestamp}-finish`,
        turnId,
        itemId: `${threadId}-${event.toolCallId}`,
        timestamp,
        payload: {
          name: event.toolName,
          status: event.status === "success" ? "completed" : "failed",
          output: event.output,
          durationMs: event.durationMs,
        },
      };
    case "runtime_error":
      return {
        type: "thread.error",
        threadId,
        notificationId: `${threadId}-${timestamp}-error`,
        timestamp,
        payload: {
          code: event.code,
          message: event.message,
        },
      };
    case "assistant_message_start":
    case "assistant_message_end":
    case "permission_decision":
      return null;
  }
}

export function toAuditEvent(event: AgentRuntimeEvent, timestamp: string): ThreadAuditEvent | null {
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
  attachments: ThreadAttachment[] | undefined,
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

function imageExtension(mimeType: Extract<ThreadAttachment, { kind: "image" }>["mimeType"]): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}
